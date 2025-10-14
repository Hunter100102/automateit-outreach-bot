import axios from 'axios';
import cheerio from 'cheerio';
import sqlite3 from 'sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { limiter, isValidEmail, looksLikeBusinessEmail, extractEmailsFromHtml, sleep } from './utils.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/outreach.sqlite');
const db = new sqlite3.Database(dbPath);

const BING_KEY = process.env.BING_SEARCH_API_KEY;
if(!BING_KEY){
  console.error('Missing BING_SEARCH_API_KEY in .env');
  process.exit(1);
}

const locations = (process.env.TARGET_LOCATIONS || '').split(';').map(s => s.trim()).filter(Boolean);
const industries = (process.env.TARGET_INDUSTRIES || '').split(';').map(s => s.trim()).filter(Boolean);
const searchKeywords = (process.env.SEARCH_KEYWORDS || 'contact').split(';').map(s => s.trim()).filter(Boolean);
const maxResults = parseInt(process.env.MAX_RESULTS_PER_QUERY || '15', 10);
const maxPagesPerDomain = parseInt(process.env.MAX_PAGES_PER_DOMAIN || '3',10);

function dbRun(sql, params=[]) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err){
    if(err) reject(err); else resolve(this);
  }));
}
function dbGet(sql, params=[]) {
  return new Promise((resolve, reject) => db.get(sql, params, (err,row)=>{
    if(err) reject(err); else resolve(row);
  }));
}

async function bingSearch(query, count=10, offset=0){
  const url = `https://api.bing.microsoft.com/v7.0/search`;
  const resp = await limiter.schedule(() => axios.get(url, {
    headers: { 'Ocp-Apim-Subscription-Key': BING_KEY },
    params: { q: query, count, offset, mkt: 'en-US', responseFilter: 'Webpages' }
  }));
  const items = (resp.data.webPages && resp.data.webPages.value) || [];
  return items.map(i => ({ name: i.name, url: i.url, snippet: i.snippet }));
}

async function fetchRobotsTxt(baseUrl){
  try{
    const u = new URL(baseUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const resp = await limiter.schedule(() => axios.get(robotsUrl, { timeout: 10000 }));
    return resp.data || '';
  }catch{
    return '';
  }
}
function isDisallowed(robotsTxt, path){
  // very light disallow check
  const lines = (robotsTxt||'').split(/\r?\n/);
  for(const line of lines){
    const l = line.trim().toLowerCase();
    if(l.startsWith('disallow:')){
      const rule = l.replace('disallow:', '').trim();
      if(rule && path.startsWith(rule)) return true;
    }
  }
  return false;
}

async function fetchPage(url){
  try{
    const resp = await limiter.schedule(() => axios.get(url, { timeout: 15000 }));
    return resp.data;
  }catch(e){
    return null;
  }
}

async function processDomain(startUrl, meta){
  try{
    const start = new URL(startUrl);
    const domain = start.hostname;
    const robotsTxt = await fetchRobotsTxt(start.origin);

    const toVisit = new Set([startUrl]);
    const visited = new Set();
    let pagesVisited = 0;

    while(toVisit.size && pagesVisited < meta.maxPagesPerDomain){
      const next = Array.from(toVisit)[0];
      toVisit.delete(next);
      if(visited.has(next)) continue;
      visited.add(next);

      const u = new URL(next);
      if(isDisallowed(robotsTxt, u.pathname)) continue;

      const html = await fetchPage(next);
      if(!html) continue;
      pagesVisited++;

      // extract emails
      const emails = extractEmailsFromHtml(html)
        .filter(isValidEmail)
        .filter(looksLikeBusinessEmail);

      for(const email of emails){
        try{
          await dbRun(
            `INSERT OR IGNORE INTO prospects (source_query, domain, page_url, email, city, state, industry)
             VALUES(?,?,?,?,?,?,?)`,
            [meta.query, domain, next, email.toLowerCase(), meta.city, meta.state, meta.industry]
          );
          console.log('Found', email, 'on', domain);
        }catch(e){ /* ignore unique */ }
      }

      // add a few same-domain links
      const $ = cheerio.load(html);
      $('a[href]').each((_,a)=>{
        try{
          const href = new URL($(a).attr('href'), next);
          if(href.hostname === domain &&
             ['http:','https:'].includes(href.protocol) &&
             !visited.has(href.href)){
            // only queue likely contact/team/about pages first
            const h = href.href.toLowerCase();
            if(h.includes('contact')||h.includes('about')||h.includes('team')||h.includes('leadership')||h.includes('management')||h.includes('staff')){
              toVisit.add(href.href);
            }
          }
        }catch{}
      });
    }

  }catch(e){
    console.error('processDomain error', e.message);
  }
}

(async () => {
  if(!locations.length || !industries.length){
    console.error('Configure TARGET_LOCATIONS and TARGET_INDUSTRIES in .env');
    process.exit(1);
  }

  for(const loc of locations){
    const [city, state] = loc.split(',').map(s=>s.trim());
    for(const industry of industries){
      const query = `${industry} ${loc} ${searchKeywords.join(' ')}`;
      console.log('Searching:', query);
      let offset = 0;
      let grabbed = 0;
      const seenDomains = new Set();

      while(grabbed < maxResults){
        const batch = await bingSearch(query, Math.min(50, maxResults - grabbed), offset);
        if(!batch.length) break;
        offset += batch.length;
        grabbed += batch.length;

        for(const item of batch){
          try{
            const u = new URL(item.url);
            if(seenDomains.has(u.hostname)) continue;
            seenDomains.add(u.hostname);
            await processDomain(item.url, { query, city, state, industry, maxPagesPerDomain });
            await sleep(300); // brief pause between domains
          }catch{}
        }
      }
    }
  }

  console.log('Scrape complete.');
  process.exit(0);
})();
