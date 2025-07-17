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

  // 🆕 Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password TEXT,
      created_at INTEGER
    );
  `);

  // 🧩 Alter messages table to include user_id + username
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

  console.log("📥 Incoming message to save:");
  console.log("   user_id     :", msg.user?.user_id);
  console.log("   username    :", msg.user?.username);
  console.log("   room        :", msg.room);
  console.log("   original    :", msg.original);
  console.log("   translation :", msg.translation);
  console.log("   timestamp   :", msg.timestamp);

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
    const rows = await db.all(`SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC`, room);
    res.json(rows);
  } catch (err) {
    console.error("❌ DB fetch failed:", err);
    res.sendStatus(500);
  }
});

/* Commented out 7/16 at 325pm
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
*/

// 🆕 Login or create user
router.post('/login-or-create', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // Try finding user
    let user = await db.get(`SELECT * FROM users WHERE username = ?`, username);

    // If not found, insert new one
    if (!user) {
      const created_at = Date.now();
      await db.run(
        `INSERT INTO users (username, created_at) VALUES (?, ?)`,
        username, created_at
      );
      user = await db.get(`SELECT * FROM users WHERE username = ?`, username);
    }

    res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error("❌ User login error:", err);
    res.status(500).json({ error: 'Login failed' });
  }
});


export default router;
