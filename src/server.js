// server.js
import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import sqlite3 from "sqlite3";
import fetch from "node-fetch";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();

// --- Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ strict: true, limit: "1mb" }));
app.use(morgan("tiny"));

// --- SQLite (ensure DB & table exist)
const dbPath = path.join(process.cwd(), "data", "outreach.sqlite");
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS suppression (
      email TEXT PRIMARY KEY,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
});

// --- Utils
const required = (name) => {
  const v = process.env[name];
  if (!v || String(v).trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
};

const mask = (s = "") =>
  s.length <= 8 ? "********" : `${s.slice(0, 4)}…${s.slice(-4)}`;

// --- Health
app.get("/health", (req, res) =>
  res.json({
    ok: true,
    env: {
      BRAVE_API_KEY: process.env.BRAVE_API_KEY ? mask(process.env.BRAVE_API_KEY) : null,
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? "set" : "unset",
      SMTP_USER: process.env.SMTP_USER ? process.env.SMTP_USER : null,
      NEVERBOUNCE_API_KEY: process.env.NEVERBOUNCE_API_KEY ? "set" : "unset",
    },
  })
);

// --- Unsubscribe (your original)
app.get("/unsubscribe", (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();
  if (!email) return res.status(400).send("Missing email");

  db.run(
    "INSERT OR IGNORE INTO suppression (email, reason) VALUES (?, ?)",
    [email, "user_unsubscribed"],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error saving preference");
      }
      res.send(
        `<html><body style="font-family:Arial,sans-serif"><h2>Unsubscribed</h2><p>${email} has been removed from future emails.</p></body></html>`
      );
    }
  );
});

// --- Search (Brave)
app.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "site:example.com contact");
    const token = required("BRAVE_API_KEY"); // throws if missing

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", q);
    url.searchParams.set("country", process.env.SEARCH_COUNTRY || "US");
    url.searchParams.set("lang", process.env.SEARCH_LANG || "en");

    const r = await fetch(url.toString(), {
      headers: { "X-Subscription-Token": token },
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      // Surface Brave’s error to help with debugging 401/422
      return res.status(r.status).json({ ok: false, providerStatus: r.status, providerBody: data });
    }

    // Normalize a bit
    const results = data?.web?.results ?? [];
    res.json({ ok: true, q, count: results.length, results });
  } catch (e) {
    console.error("SEARCH ERR:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Send (SendGrid) — uses sandbox by default if SENDGRID_SANDBOX=true
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

app.post("/send", async (req, res) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ ok: false, error: "SENDGRID_API_KEY is not set" });
    }

    const fromEmail = required("FROM_EMAIL");
    const fromName = process.env.FROM_NAME || "";

    const { to, subject, text, html } = req.body || {};
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ ok: false, error: "Missing 'to', 'subject', and 'text' or 'html'" });
    }

    const sandbox = String(process.env.SENDGRID_SANDBOX || "true").toLowerCase() === "true";

    const [resp] = await sgMail.send({
      to,
      from: { email: fromEmail, name: fromName },
      subject,
      text,
      html,
      mailSettings: sandbox ? { sandboxMode: { enable: true } } : undefined,
    });

    return res.status(resp?.statusCode || 202).json({
      ok: true,
      sandbox,
      statusCode: resp?.statusCode || 202,
    });
  } catch (e) {
    console.error("SENDGRID ERR:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Send via SMTP (Gmail App Password)
app.post("/send-smtp", async (req, res) => {
  try {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
    const user = required("SMTP_USER");
    const pass = required("SMTP_PASS");
    const fromEmail = required("FROM_EMAIL");
    const fromName = process.env.FROM_NAME || "";

    const { to, subject, text, html } = req.body || {};
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ ok: false, error: "Missing 'to', 'subject', and 'text' or 'html'" });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });

    res.json({ ok: true, id: info.messageId });
  } catch (e) {
    console.error("SMTP ERR:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- NeverBounce single-check helper route
app.get("/verify-email", async (req, res) => {
  try {
    const key = process.env.NEVERBOUNCE_API_KEY;
    if (!key) return res.status(400).json({ ok: false, error: "NEVERBOUNCE_API_KEY is not set" });

    const email = String(req.query.email || "").trim();
    if (!email) return res.status(400).json({ ok: false, error: "email required" });

    const url = new URL("https://api.neverbounce.com/v4/single/check");
    url.searchParams.set("key", key);
    url.searchParams.set("email", email);

    const r = await fetch(url.toString());
    const data = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : r.status).json({ ok: r.ok, data });
  } catch (e) {
    console.error("NEVERBOUNCE ERR:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- 404 fallback
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

// --- Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
