// modules/persistence_sqlite/server/helpers.js
import { getDB } from './db.js';

export async function PS_saveMessage(message) {
  const db = await getDB();
  await db.run(
    `INSERT INTO messages (room, sender, original, translation, warning, sourceLang, targetLang, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.room,
      message.sender,
      message.original,
      message.translation,
      message.warning || '',
      message.sourceLang || '',
      message.targetLang || '',
      message.timestamp || new Date().toISOString()
    ]
  );
}

export async function PS_getMessagesByRoom(room) {
  const db = await getDB();
  const rows = await db.all(
    `SELECT * FROM messages WHERE room = ? ORDER BY id ASC`,
    [room]
  );
  return rows;
}
