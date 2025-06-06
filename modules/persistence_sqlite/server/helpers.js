// modules/persistence_sqlite/server/helpers.js
import { PS_getDB } from './db.js';

export async function PS_saveMessage(message) {
  const db = await PS_getDB();
  await db.run(
    `INSERT INTO messages (room, sender, original, translation, warning, sourceLang, targetLang, deviceId, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.room,
      message.sender,
      message.original,
      message.translation,
      message.warning || '',
      message.sourceLang || '',
      message.targetLang || '',
      message.deviceId || '',
      message.timestamp || new Date().toISOString()
    ]
  );
}

export async function PS_getMessagesByRoom(room) {
  const db = await PS_getDB();
  const rows = await db.all(
    `SELECT * FROM messages WHERE room = ? ORDER BY id ASC`,
    [room]
  );
  return rows;
}
