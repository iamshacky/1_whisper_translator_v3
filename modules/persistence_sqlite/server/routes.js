import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const router = express.Router();

let db;
const setupDB = async () => {
  db = await open({
    //filename: './modules/persistence_sqlite/messages.db',
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT,
      deviceId TEXT,
      sender TEXT,
      original TEXT,
      translation TEXT,
      warning TEXT,
      sourceLang TEXT,
      targetLang TEXT,
      timestamp INTEGER,
      audio TEXT
    );
  `);
};

setupDB();

router.post('/save', async (req, res) => {
  const msg = req.body;
  try {
    await db.run(
      `INSERT INTO messages (room, deviceId, sender, original, translation, warning, sourceLang, targetLang, timestamp, audio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      msg.room,
      msg.deviceId,
      msg.sender,
      msg.original,
      msg.translation,
      msg.warning,
      msg.sourceLang,
      msg.targetLang,
      msg.timestamp,
      msg.audio
    );
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ DB insert failed:", err);
    res.sendStatus(500);
  }
});

router.get('/messages', async (req, res) => {
  const room = req.query.room || 'default';
  try {
    const rows = await db.all(`SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC`, room);
    res.json(rows);
  } catch (err) {
    console.error("❌ DB fetch failed:", err);
    res.sendStatus(500);
  }
});

router.get('/load', async (req, res) => {
  try {
    const dbPath = path.resolve('./modules/persistence_sqlite/messages.db');
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    const messages = await db.all('SELECT * FROM messages ORDER BY timestamp ASC');
    res.json(messages);
  } catch (err) {
    console.error('Failed to load messages:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

export default router;
