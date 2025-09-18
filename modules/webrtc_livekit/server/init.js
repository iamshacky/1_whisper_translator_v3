
// modules/webrtc_livekit/server/init.js  (or wherever you defined it)
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';

export function LIVEKIT__initServer(app) {
  const router = express.Router();

  router.get('/config', (_req, res) => {
    const enabled =
      !!process.env.LIVEKIT_URL &&
      !!process.env.LIVEKIT_API_KEY &&
      !!process.env.LIVEKIT_API_SECRET;

    res.json({
      enabled,
      url: process.env.LIVEKIT_URL || null
    });
  });

  router.post('/token', async (req, res) => {
    try {
      const { room, identity, name } = req.body || {};
      if (!room || !identity) return res.status(400).json({ error: 'room and identity required' });

      const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        name,
        // ttl: 3600, // optional
      });

      at.addGrant({
        room,               // ← must match the room you’ll join (e.g. "room-zqzrmnjk")
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      res.json({ token, url: process.env.LIVEKIT_URL });
    } catch (e) {
      console.error('LiveKit token error:', e);
      return res.status(503).json({ error: 'Token generation failed' });
    }
  });

  app.use('/api/webrtc_livekit', router);
}
