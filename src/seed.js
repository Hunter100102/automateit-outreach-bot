import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/outreach.sqlite');
const schemaPath = path.join(__dirname, '../data/schema.sql');

(async () => {
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new sqlite3.Database(dbPath);
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('Failed to apply schema:', err);
      process.exit(1);
    }
    console.log('Database initialized at', dbPath);
    db.close();
  });
})();
