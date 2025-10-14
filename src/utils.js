import Bottleneck from 'bottleneck';
import dotenv from 'dotenv';
dotenv.config();

export const limiter = new Bottleneck({
  minTime: Math.ceil(60000 / (parseInt(process.env.REQUESTS_PER_MINUTE || '30',10))),
  maxConcurrent: 1
});

export function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export function looksLikeBusinessEmail(email){
  const domain = (email.split('@')[1]||'').toLowerCase();
  const freemail = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','proton.me','protonmail.com','live.com','msn.com','me.com']);
  return !freemail.has(domain);
}

export function isValidEmail(email){
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/;
  return re.test(email);
}

export function extractEmailsFromHtml(html){
  const emails = new Set();
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g;
  let m;
  while((m = re.exec(html)) !== null){
    emails.add(m[0]);
  }
  return Array.from(emails);
}
