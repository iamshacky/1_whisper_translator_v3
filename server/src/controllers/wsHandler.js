// server/src/controllers/wsHandler.js
import WebSocket from 'ws';
import { translateController } from './translate.js';
import { randomUUID } from 'crypto';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const rooms = new Map(); // roomId → Set<WebSocket>

export function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const url        = new URL(req.url, `http://${req.headers.host}`);
    const roomId     = url.searchParams.get('room') || 'default';
    const targetLang = url.searchParams.get('lang') || 'es';
    const clientId   = url.searchParams.get('clientId') || randomUUID();
    ws.clientId      = clientId;

    // Join the room
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(ws);
    ws.roomId = roomId;

    ws.on('message', async (message, isBinary) => {
      console.log(`[WS] got ${isBinary ? 'binary' : 'text'} from ${clientId}`);

      try {
        if (isBinary) {
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const rootDir = path.resolve(__dirname, '../../../');
          const configPath = path.join(rootDir, 'modules', 'settings_panel', 'server', 'config.json');

          let inputLangMode = 'auto';
          let manualInputLang = 'en';

          try {
            const raw = await fs.readFile(configPath, 'utf-8');
            const cfg = JSON.parse(raw);
            inputLangMode = cfg.inputLangMode;
            manualInputLang = cfg.manualInputLang;
          } catch (err) {
            console.warn("⚠️ Could not read language config. Falling back.");
          }

          const { text, translation, audio, detectedLang } = await translateController(
            Buffer.from(message),
            targetLang,
            inputLangMode,
            manualInputLang
          );

          const payload = {
            type: 'preview',
            text,
            translation,
            audio: audio || null,
            detectedLang
          };

          console.log("[WS] sending preview back:", {
            text,
            translation,
            audio: audio ? `${audio.slice(0, 20)}…` : "(none)"
          });

          ws.send(JSON.stringify(payload));

        } else {
          const { original, translation, warning = '', clientId: senderId } = JSON.parse(message);

          const broadcastMessage = JSON.stringify({
            type: 'final',                    // ✅ Add this
            speaker: 'them',
            original,
            translation,
            warning,
            clientId: senderId
          });

          const ownMessage = JSON.stringify({
            type: 'final',                    // ✅ Add this
            speaker: 'you',
            original,
            translation,
            warning,
            clientId: senderId
          });

          for (const client of rooms.get(ws.roomId || 'default') || []) {
            if (client.readyState !== WebSocket.OPEN) continue;
            client.send(client === ws ? ownMessage : broadcastMessage);
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
