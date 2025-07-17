import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let db;

export async function setupDB() {
  db = await open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database
  });

  await db.run(`
    CREATE TABLE IF NOT EXISTS deletion_settings (
      room TEXT PRIMARY KEY,
      expires_after_ms INTEGER
    )
  `);

  // Start cleanup loop every 5 minutes
  setInterval(deleteExpiredMessagesForAllRooms, 5 * 60 * 1000);
}

export async function setRoomExpiration(room, expires_after_ms) {
  await db.run(`
    INSERT INTO deletion_settings (room, expires_after_ms)
    VALUES (?, ?)
    ON CONFLICT(room) DO UPDATE SET expires_after_ms = excluded.expires_after_ms
  `, [room, expires_after_ms]);
}

export async function getRoomExpiration(room) {
  const row = await db.get(`SELECT expires_after_ms FROM deletion_settings WHERE room = ?`, [room]);
  return row?.expires_after_ms || null;
}

export async function deleteMessagesOlderThan(room, cutoffTime) {
  await db.run(`
    DELETE FROM messages
    WHERE room = ? AND timestamp < ?
  `, [room, cutoffTime]);
}

export async function deleteAllMessages(room) {
  console.log("🔍 Deleting messages for room:", room);
  await db.run(`DELETE FROM messages WHERE room = ?`, [room]);
}

export async function deleteExpiredMessagesForAllRooms() {
  const now = Date.now();
  const rows = await db.all(`SELECT room, expires_after_ms FROM deletion_settings`);
  for (const { room, expires_after_ms } of rows) {
    if (expires_after_ms > 0) {
      const cutoff = now - expires_after_ms;
      await deleteMessagesOlderThan(room, cutoff);
    }
  }
}
