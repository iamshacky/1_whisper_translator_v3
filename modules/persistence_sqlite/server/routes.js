import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const router = express.Router();

let db;
const setupDB = async () => {
  db = await open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database,
  });

  // 🆕 Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password TEXT,
      created_at INTEGER,
      google_sub TEXT UNIQUE,  -- Google account subject (unique per Google user)
      provider TEXT            -- Optional: which auth provider was used (e.g., 'google', 'native')
    );
  `);

  // 🧩 Messages table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT,
      user_id INTEGER,
      username TEXT,
      original TEXT,
      translation TEXT,
      warning TEXT,
      sourceLang TEXT,
      targetLang TEXT,
      timestamp INTEGER,
      audio TEXT,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
};

setupDB();

router.post('/save', async (req, res) => {
  const msg = req.body;

  try {
    await db.run(
      `INSERT INTO messages (
        room, user_id, username, original, translation, warning,
        sourceLang, targetLang, timestamp, audio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      msg.room,
      msg.user?.user_id || null,
      msg.user?.username || null,
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
    const rows = await db.all(
      `SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC`,
      room
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ DB fetch failed:", err);
    res.sendStatus(500);
  }
});

// 🆕 Login or create user (native "quick login" path with provider)
router.post('/login-or-create', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // Try finding user
    let user = await db.get(`SELECT * FROM users WHERE username = ?`, username);

    // If not found, insert new one (provider='native')
    if (!user) {
      const created_at = Date.now();
      await db.run(
        `INSERT INTO users (username, created_at, provider)
         VALUES (?, ?, 'native')`,
        username, created_at
      );
      user = await db.get(`SELECT * FROM users WHERE username = ?`, username);
    } else if (!user.provider) {
      // Backfill legacy rows that predate the provider column
      await db.run(`UPDATE users SET provider = 'native' WHERE user_id = ?`, user.user_id);
    }

    res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error("❌ User login error:", err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
