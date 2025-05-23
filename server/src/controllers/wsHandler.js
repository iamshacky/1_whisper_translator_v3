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

    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(ws);

    ws.on('message', async (message, isBinary) => {
      console.log(`[WS] got ${isBinary ? 'binary' : 'text'} from ${clientId}`);

      try {
        if (isBinary) {
          const { text, translation, audio, sourceLang } = await translateController(
            Buffer.from(message),
            targetLang
          );

          const payload = {
            type: 'preview',
            text,
            translation,
            audio,
            langCode: `${sourceLang} → ${targetLang}`
          };

          ws.send(JSON.stringify(payload));
        } else {
          const { text, translation, audio, langCode } = JSON.parse(message);

          for (const client of rooms.get(roomId)) {
            if (client.readyState !== WebSocket.OPEN) continue;
            client.send(JSON.stringify({
              type: 'final',
              text,
              translation,
              audio,
              sender: client === ws ? 'me' : 'they',
              langCode
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
