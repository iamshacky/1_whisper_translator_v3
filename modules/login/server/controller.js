// modules/login/server/controller.js

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

export async function loginUser(req, res) {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const db = await open({
      filename: path.resolve('modules/persistence_sqlite/messages.db'),
      driver: sqlite3.Database,
    });

    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // 🛡️ For now, simple password check (plaintext)
    if (user.password !== password) {
      return res.status(403).json({ error: 'Incorrect password.' });
    }

    return res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function createUser(req, res) {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const db = await open({
      filename: path.resolve('modules/persistence_sqlite/messages.db'),
      driver: sqlite3.Database,
    });

    const existing = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (existing) return res.status(409).json({ error: 'Username already exists.' });

    const created_at = Date.now();
    await db.run('INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)', username, password, created_at);

    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    return res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error('❌ Create user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
