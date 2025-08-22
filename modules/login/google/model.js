import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let db;

async function getDB() {
  if (!db) {
    db = await open({
      filename: path.resolve('modules/persistence_sqlite/messages.db'),
      driver: sqlite3.Database,
    });
  }
  return db;
}

export async function findOrCreateGoogleUser(googleId, email) {
  const db = await getDB();

  // Check if exists
  const existing = await db.get(
    `SELECT user_id, username FROM users WHERE google_sub = ?`,
    [googleId]
  );
  if (existing) return existing;

  // Create unique username
  const username = `google_${Math.random().toString(36).substring(2, 8)}`;

  const result = await db.run(
    `INSERT INTO users (username, google_sub, email) VALUES (?, ?, ?)`,
    [username, googleId, email]
  );

  return {
    user_id: result.lastID,
    username,
  };
}
