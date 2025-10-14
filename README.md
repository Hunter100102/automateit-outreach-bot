# AutomateIT Outreach Bot

A respectful, CAN‑SPAM–aware outreach bot to discover US SMB prospects, extract public business emails, and send your audit offer with an unsubscribe link.

## What it does
- Uses **Bing Web Search API** to discover SMB websites by city/industry.
- Crawls a few public pages (respects `robots.txt`, rate limited).
- Extracts public **business** emails (filters out freemail).
- (Optional) Verifies emails with NeverBounce.
- Sends your email via **SendGrid** with logo & unsubscribe.
- Stores prospects, sends, and suppressions in **SQLite**.
- Hosts `/unsubscribe` and `/health` endpoints via Express.
- Simple cron or CLI: `npm run scrape` then `npm run send`.

> ⚖️ **Compliance**: Always include your postal address and an unsubscribe link. Only email business contacts for business purposes, and honor removals. Add your company address in `.env`.

## Quick start
```bash
# 1) Unzip, then in the project folder:
cp .env.example .env
# edit .env with your keys and address

# 2) Install & init DB
npm install
npm run seed

# 3) Discover prospects (change industries/locations in .env)
npm run scrape

# 4) Send email to newly discovered + not-suppressed prospects
npm run send

# 5) Run the web server (for unsubscribe + health)
npm run dev
```

## Deploy
- **Render/Heroku**: Deploy a Node service, add the `.env` vars. Expose port `process.env.PORT` (defaults to 3000).
- Set a cron on the platform, or use Render's background worker:
  - `npm run scrape` hourly/daily
  - `npm run send` hourly/daily

## Files
- `src/scrape.js` — discovery + crawling + email extraction
- `src/send.js` — email sending + suppression checks
- `src/server.js` — Express server with unsubscribe
- `src/seed.js` — initialize SQLite schema
- `data/schema.sql` — database schema
- `templates/email.html` — email template
- `templates/assets/logo.png` — your logo
