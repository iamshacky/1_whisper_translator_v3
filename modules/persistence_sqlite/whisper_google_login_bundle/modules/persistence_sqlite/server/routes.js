import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../messages.db');
const db = new sqlite3.Database(dbPath);
const router = express.Router();

router.post('/save-message', (req, res) => {
  const { username, original, translation, warning, sourceLang, targetLang, timestamp, audio } = req.body;
  db.run(
    `INSERT INTO messages (username, original, translation, warning, sourceLang, targetLang, timestamp, audio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [username, original, translation, warning, sourceLang, targetLang, timestamp, audio],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

router.post('/get-messages', (req, res) => {
  const { username } = req.body;
  db.all(`SELECT * FROM messages WHERE username = ? ORDER BY timestamp ASC`, [username], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/login', (req, res) => {
  const { username } = req.body;
  res.json({ username });
});

export default router;