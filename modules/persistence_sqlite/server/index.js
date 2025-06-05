// modules/persistence_sqlite/server/index.js
import express from 'express';
import { PS_getMessagesByRoom, PS_saveMessage } from './helpers.js';

const router = express.Router();

router.get('/messages', async (req, res) => {
  const room = req.query.room || 'default';
  try {
    const messages = await PS_getMessagesByRoom(room);
    res.json(messages);
  } catch (err) {
    console.error("❌ Failed to load messages:", err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/save', async (req, res) => {
  const message = req.body;
  try {
    await PS_saveMessage(message);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save message:", err);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

export default router;
