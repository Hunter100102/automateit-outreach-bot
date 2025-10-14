import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import sqlite3 from 'sqlite3';

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('tiny'));

const db = new sqlite3.Database(path.join(process.cwd(), 'data', 'outreach.sqlite'));

app.get('/health', (req,res)=>res.json({ ok: true }));

app.get('/unsubscribe', (req,res)=>{
  const email = (req.query.email || '').toLowerCase().trim();
  if(!email) return res.status(400).send('Missing email');

  db.run('INSERT OR IGNORE INTO suppression (email, reason) VALUES (?, ?)', [email, 'user_unsubscribed'], (err)=>{
    if(err){
      console.error(err);
      return res.status(500).send('Error saving preference');
    }
    res.send(`<html><body style="font-family:Arial,sans-serif"><h2>Unsubscribed</h2><p>${email} has been removed from future emails.</p></body></html>`);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server running on', PORT));
