// server/db/persistence_sqlite.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use absolute path for DB
const dbPath = path.join(__dirname, 'whisper_translator.db');

let db;

export async function initDb() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA foreign_keys = ON;");
}

export async function saveMessage(data) {
  const {
    room_id,
    sender_id,
    sender_type,
    original,
    corrected,
    translated,
    my_output,
    source_lang,
    target_lang,
    warning
  } = data;

  const sql = `
    INSERT INTO messages (
      room_id, sender_id, sender_type, original, corrected, translated,
      my_output, source_lang, target_lang, warning
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    room_id, sender_id, sender_type, original, corrected, translated,
    my_output, source_lang, target_lang, warning
  ];

  await db.run(sql, params);
}

export async function getMessagesByRoom(room_id, limit = 50) {
  const rows = await db.all(
    `SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`,
    [room_id, limit]
  );
  return rows.reverse();
}

export async function ensureRoomExists(roomName) {
  const row = await db.get(`SELECT id FROM rooms WHERE name = ?`, [roomName]);
  if (row) return row.id;

  const result = await db.run(`INSERT INTO rooms (name) VALUES (?)`, [roomName]);
  return result.lastID;
}
