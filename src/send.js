import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const db = new sqlite3.Database(path.join(process.cwd(), 'data', 'outreach.sqlite'));

function dbAll(sql, params=[]){
  return new Promise((resolve,reject)=>db.all(sql, params, (err,rows)=> err?reject(err):resolve(rows)));
}
function dbRun(sql, params=[]){
  return new Promise((resolve,reject)=>db.run(sql, params, function(err){ err?reject(err):resolve(this); }));
}

function renderTemplate(html){
  return html
    .replaceAll('{{CALENDLY_URL}}', process.env.CALENDLY_URL || '#')
    .replaceAll('{{UNSUBSCRIBE_URL}}', `${process.env.PUBLIC_BASE_URL}/unsubscribe?email={{EMAIL}}`)
    .replaceAll('{{COMPANY_ADDRESS_1}}', process.env.COMPANY_ADDRESS_1 || '')
    .replaceAll('{{COMPANY_ADDRESS_2}}', process.env.COMPANY_ADDRESS_2 || '')
    .replaceAll('{{COMPANY_CITY}}', process.env.COMPANY_CITY || '')
    .replaceAll('{{COMPANY_STATE}}', process.env.COMPANY_STATE || '')
    .replaceAll('{{COMPANY_ZIP}}', process.env.COMPANY_ZIP || '')
    .replaceAll('{{COMPANY_COUNTRY}}', process.env.COMPANY_COUNTRY || '');
}

async function main(){
  // Create SMTP transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_SECURE || 'true') === 'true', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'templates', 'email.html'), 'utf-8');
  const emailHtmlBase = renderTemplate(htmlTemplate);

  const prospects = await dbAll(`
    SELECT p.email
    FROM prospects p
    LEFT JOIN suppression s ON s.email = p.email
    LEFT JOIN sends se ON se.prospect_email = p.email
    WHERE s.email IS NULL
      AND (se.status IS NULL OR se.status != 'sent')
    LIMIT 50
  `);

  if(!prospects.length){
    console.log('No prospects to email.');
    process.exit(0);
  }

  const logoPath = path.join(process.cwd(), 'templates', 'assets', 'logo.png');

  for(const row of prospects){
    const email = row.email.toLowerCase();
    const html = emailHtmlBase.replaceAll('{{EMAIL}}', encodeURIComponent(email));

    const mailOptions = {
      to: email,
      from: { address: process.env.FROM_EMAIL, name: process.env.FROM_NAME || 'AutomateIT' },
      subject: 'Automation Implementation Help',
      html,
      attachments: [
        {
          filename: 'logo.png',
          path: logoPath,
          cid: 'logo' // matches cid:logo in the template
        }
      ]
    };

    try{
      const info = await transporter.sendMail(mailOptions);
      await dbRun('INSERT INTO sends (prospect_email, sendgrid_msg_id, status) VALUES (?,?,?)',
        [email, info.messageId || '', 'sent']);
      console.log('Sent to', email, info.messageId);
    }catch(e){
      console.error('Send failed for', email, e.message);
      await dbRun('INSERT INTO sends (prospect_email, status, error) VALUES (?,?,?)',
        [email, 'error', e.message]);
    }
  }

  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
