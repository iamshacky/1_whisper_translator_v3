import {
  setRoomExpiration,
  deleteAllMessages,
  getRoomExpiration
} from './model.js';

export async function handleSetExpiration(req, res) {
  const { room, expires_after_ms } = req.body;
  if (!room || expires_after_ms == null) {
    return res.status(400).json({ error: 'Missing room or expires_after_ms' });
  }

  await setRoomExpiration(room, expires_after_ms);
  res.json({ success: true });
}

export async function handleDeleteAll(req, res) {
  const room = req.query.room;
  if (!room) return res.status(400).json({ error: 'Missing room' });

  await deleteAllMessages(room);
  res.json({ success: true });
}

export async function handleGetExpiration(req, res) {
  const room = req.query.room;
  if (!room) return res.status(400).json({ error: 'Missing room' });

  const expires_after_ms = await getRoomExpiration(room);
  res.json({ expires_after_ms });
}
