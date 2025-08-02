import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let db;

export async function initRoomDB() {
  db = await open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database
  });

  await db.run(`
    CREATE TABLE IF NOT EXISTS created_rooms (
      room TEXT PRIMARY KEY,
      created_by TEXT,
      created_at INTEGER
    )
  `);
}

export async function registerRoom(room, createdBy) {
  if (!room || !createdBy) return;

  const timestamp = Date.now();
  await db.run(`
    INSERT OR IGNORE INTO created_rooms (room, created_by, created_at)
    VALUES (?, ?, ?)
  `, [room, createdBy, timestamp]);
}

export async function isRoomValid(room) {
  const row = await db.get(`SELECT room FROM created_rooms WHERE room = ?`, [room]);
  return !!row;
}
