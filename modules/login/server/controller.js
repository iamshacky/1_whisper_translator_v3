// modules/login/server/controller.js

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// --- DB helper ---------------------------------------------------------------
async function getDB() {
  return open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database,
  });
}

// Create a new user with password
async function createNewUser(db, username, password) {
  const created_at = Date.now();
  await db.run(
    'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)',
    username, password, created_at
  );
  return db.get('SELECT * FROM users WHERE username = ?', username);
}

// Update only the password column
async function updateUserPassword(db, user_id, password) {
  await db.run('UPDATE users SET password = ? WHERE user_id = ?', password, user_id);
}

// --- Handlers ----------------------------------------------------------------

// STRICT login (no auto-create). Returns 401 if user missing, 403 if wrong password.
export async function loginUser(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const db = await getDB();
    let user = await db.get('SELECT * FROM users WHERE username = ?', username);

    // Not found → do NOT create here
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    // Optional legacy support:
    // If this account exists but the password column is empty, set it on first successful login.
    // Remove this block if you want fully strict behavior.
    if (!user.password) {
      await updateUserPassword(db, user.user_id, password);
      user.password = password;
    }

    // Check password match
    if (user.password !== password) {
      return res.status(403).json({ error: 'Incorrect password.' });
    }

    return res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Explicit registration (kept separate)
export async function createUser(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const db = await getDB();
    const existing = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const user = await createNewUser(db, username, password);
    return res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error('❌ Create user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Gets user-created rooms for Your Rooms UI
/*
export async function getMyCreatedRooms(req, res) {
  const user_id = parseInt(req.query.user_id);
  if (!user_id) {
    return res.status(400).json({ error: 'Missing or invalid user_id' });
  }

  try {
    const db = await getDB();
    const rows = await db.all('SELECT DISTINCT room FROM messages WHERE user_id = ?', user_id);
    const rooms = rows.map(row => row.room);
    res.json({ rooms });
  } catch (err) {
    console.error('❌ Error fetching user-created rooms:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
*/
// Gets user-created rooms for Your Rooms UI 2nd one
/*
export async function getMyCreatedRooms(req, res) {
  const user_id = parseInt(req.query.user_id);
  if (!user_id) {
    return res.status(400).json({ error: 'Missing or invalid user_id' });
  }

  try {
    const db = await getDB();

    // Look up username from user_id
    const user = await db.get('SELECT username FROM users WHERE user_id = ?', user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Only return rooms actually created by this username
    const rows = await db.all('SELECT room FROM created_rooms WHERE created_by = ?', user.username);
    const rooms = rows.map(row => row.room);

    res.json({ rooms });
  } catch (err) {
    console.error('❌ Error fetching user-created rooms:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
*/
// modules/login/server/controller.js
export async function getMyCreatedRooms(req, res) {
  const user_id = parseInt(req.query.user_id);
  if (!user_id) {
    return res.status(400).json({ error: 'Missing or invalid user_id' });
  }

  try {
    const db = await getDB();
    // ✅ Only fetch rooms the user actually created
    const rows = await db.all('SELECT room FROM created_rooms WHERE created_by = ?', user_id);
    const rooms = rows.map(row => row.room);
    res.json({ rooms });
  } catch (err) {
    console.error('❌ Error fetching user-created rooms:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
