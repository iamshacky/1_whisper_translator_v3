import { registerRoom, isRoomValid } from './model.js';

export async function handleRegisterRoom(req, res) {
  const { roomId, createdBy } = req.body;
  if (!roomId || !createdBy) {
    return res.status(400).json({ error: 'Missing roomId or createdBy' });
  }

  await registerRoom(roomId, createdBy);
  res.json({ success: true });
}

export async function handleCheckRoomValid(req, res) {
  const room = req.query.room;
  if (!room) return res.status(400).json({ error: 'Missing room' });

  const valid = await isRoomValid(room);
  res.json({ valid });
}
