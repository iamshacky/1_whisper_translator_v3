// modules/persistence_sqlite/server/db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../../data/messages.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export async function PS_getDB() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT,
      sender TEXT,
      original TEXT,
      translation TEXT,
      warning TEXT,
      sourceLang TEXT,
      targetLang TEXT,
      deviceId TEXT,
      timestamp TEXT
    );
  `);

  return db;
}
