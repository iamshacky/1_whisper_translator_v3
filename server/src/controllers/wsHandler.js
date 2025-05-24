// server/src/controllers/wsHandler.js
import WebSocket from 'ws';
import { translateController } from './translate.js';
import { randomUUID } from 'crypto';

const rooms = new Map(); // roomId → Set<WebSocket>

export function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const url        = new URL(req.url, `http://${req.headers.host}`);
    const roomId     = url.searchParams.get('room') || 'default';
    const targetLang = url.searchParams.get('lang') || 'es';
    const clientId   = url.searchParams.get('clientId') || randomUUID();
    ws.clientId      = clientId;

    // join the room
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(ws);

    ws.on('message', async (message, isBinary) => {
      console.log(`[WS] got ${isBinary ? 'binary' : 'text'} from ${clientId}`);

      try {
        if (isBinary) {
          // preview step: transcribe, translate, TTS
          const { text, translation, audio } = await translateController(
            Buffer.from(message),
            targetLang
          );

          const payload = {
            speaker:    'you',
            original:   text,
            translation,
            ...(audio ? { audio } : {})     // only include audio if non-empty
          };

          console.log("[WS] sending preview back:", {
            text,
            translation,
            audio: audio ? `${audio.slice(0,20)}…` : "(none)"
          });
          ws.send(JSON.stringify(payload));

        } else {
          // final chat broadcast
          const { original, translation, clientId: senderId } = JSON.parse(message);
          for (const client of rooms.get(roomId)) {
            if (client.readyState !== WebSocket.OPEN) continue;
            client.send(JSON.stringify({
              speaker:    client === ws ? 'you' : 'them',
              original,
              translation,
              clientId: senderId
            }));
          }
        }
      } catch (err) {
        console.error("❌ [WS] Error handling message:", err);
      }
    });

    ws.on('close', () => {
      const room = rooms.get(roomId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(roomId);
      }
    });
  });
}
