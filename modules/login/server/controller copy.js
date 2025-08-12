// modules/login/server/controller.js

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Internal helper: open DB connection
async function getDB() {
  return open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database,
  });
}

// Internal helper: create a new user
async function createNewUser(db, username, password) {
  const created_at = Date.now();
  await db.run(
    'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)',
    username, password, created_at
  );
  return db.get('SELECT * FROM users WHERE username = ?', username);
}

// Internal helper: update an existing user's password
async function updateUserPassword(db, user_id, password) {
  await db.run('UPDATE users SET password = ? WHERE user_id = ?', password, user_id);
}

// Login handler (also creates account if user doesn’t exist)
/*
export async function loginUser(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const db = await getDB();
    let user = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!user) {
      // No user → create them
      user = await createNewUser(db, username, password);
    } else {
      // If password is missing or different → update it
      if (!user.password || user.password !== password) {
        await updateUserPassword(db, user.user_id, password);
        user.password = password;
      }

      // Check password match
      if (user.password !== password) {
        return res.status(403).json({ error: 'Incorrect password.' });
      }
    }

    return res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
*/
export async function loginUser(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const db = await getDB();
    let user = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!user) {
      // Create brand new user with provided password
      user = await createNewUser(db, username, password);
      return res.json({ user_id: user.user_id, username: user.username });
    }

    // If user exists, validate password first
    if (user.password !== password) {
      // If password field is empty (legacy account), set it
      if (!user.password) {
        await updateUserPassword(db, user.user_id, password);
        user.password = password;
      } else {
        // If password is set but wrong → reject
        return res.status(403).json({ error: 'Incorrect password.' });
      }
    }

    return res.json({ user_id: user.user_id, username: user.username });
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Explicit create account endpoint (still available separately)
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

// Gets user-created rooms and populates their localStorage with the array.
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
