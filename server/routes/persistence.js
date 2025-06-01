// server/routes/persistence.js

/*
const persistenceRoutes = require('./routes/persistence');
app.use('/api', persistenceRoutes);
*/

const express = require('express');
const router = express.Router();
const db = require('../db/persistence_sqlite');

router.get('/history/:room', async (req, res) => {
  try {
    const room_id = await db.ensureRoomExists(req.params.room);
    const messages = await db.getMessagesByRoom(room_id, 100);
    res.json({ success: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/message', async (req, res) => {
  try {
    const room_id = await db.ensureRoomExists(req.body.room);
    const id = await db.saveMessage({ ...req.body, room_id });
    res.json({ success: true, message_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
