// modules/webrtc/server/init.js
import express from 'express';

export function WEBRTC__initServer(app) {
  const router = express.Router();

  // Simple ICE config endpoint (TURN can be added later)
  router.get('/ice-config', (_req, res) => {
    res.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
  });

  app.use('/api/webrtc', router);
}
