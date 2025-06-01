// server/src/controllers/wsHandler.js
import WebSocket from 'ws';
import { translateController } from './translate.js';
import { randomUUID } from 'crypto';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
//const db = require('../../db/persistence_sqlite');
import * as db from '../../db/persistence_sqlite.js';

const rooms = new Map(); // roomId → Set<WebSocket>

export function setupWebSocket(wss) {
  wss.on('connection', async (ws, req) => {
    const url        = new URL(req.url, `http://${req.headers.host}`);

    const roomId   = url.searchParams.get('room') || 'default';
      const clientId = url.searchParams.get('clientId') || randomUUID();

      // 🛠 Dynamically load targetLang from settings config
      let targetLang = 'es'; // fallback
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const rootDir = path.resolve(__dirname, '../../../');
        const configPath = path.join(rootDir, 'modules', 'settings_panel', 'server', 'config.json');
        const raw = await fs.readFile(configPath, 'utf-8');
        const cfg = JSON.parse(raw);
        targetLang = cfg.targetLang || 'es';
      } catch (err) {
        console.warn("⚠️ Could not read targetLang from settings. Defaulting to 'es'");
      }

    ws.clientId = clientId;

    // Join the room
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(ws);
    ws.roomId = roomId;

    const saveIncoming = async (msgData, roomId, targetLang) => {
      try {
        const dbRoomId = await db.ensureRoomExists(roomId || 'default');

        await db.saveMessage({
          room_id: dbRoomId,
          sender_id: msgData.clientId,
          sender_type: msgData.speaker === 'you' ? 'me' : 'them',
          original: msgData.original,
          corrected: msgData.text !== msgData.original ? msgData.text : null,
          translated: msgData.translation,
          my_output: msgData.myOutput || null,
          source_lang: msgData.sourceLang || 'unknown',
          target_lang: targetLang,
          warning: msgData.warning || null
        });
      } catch (err) {
        console.error("❌ [DB] Failed to save message:", err);
      }
    };

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
            detectedLang,
            sourceLang: detectedLang,
            targetLang: targetLang,
          };

          console.log("[WS] sending preview back:", {
            text,
            translation,
            audio: audio ? `${audio.slice(0, 20)}…` : "(none)"
          });

          console.log('🟨 Preview payload being sent:');
          console.log('   📝 text        :', text);
          console.log('   🌐 translation :', translation);
          console.log('   🎧 audio       :', audio ? audio.slice(0, 20) + '...' : '(none)');
          console.log('   🧭 detectedLang:', detectedLang);
          console.log('   📩 to clientId :', clientId);

          ws.send(JSON.stringify(payload));

          console.log('🟨 End of preview log\n');

        } else {

          const {
            original,
            cleaned = '',
            translation,
            warning = '',
            clientId: senderId,
            moderatorSuggestion = '',
            inputMethod = 'text'
          } = JSON.parse(message);

          console.log('🟦 Final message received:');
          console.log('   📝 original    :', original);
          console.log('   🧹 cleaned     :', cleaned || '(none)');
          console.log('   💬 suggestion  :', moderatorSuggestion || '(none)');
          console.log('   🌐 translation :', translation);
          console.log('   ⚠️ warning     :', warning || '(none)');
          console.log('   📥 inputMethod :', inputMethod);
          console.log('   📩 from clientId:', senderId);

          await saveIncoming({
            original,
            text: cleaned || original,
            translation,
            warning,
            clientId: senderId,
            sourceLang: message.detectedLang || '',
            targetLang: targetLang
          }, ws.roomId, targetLang);

          const broadcastMessage = JSON.stringify({
            type: 'final',
            speaker: 'them',
            original,
            text: cleaned || original,
            translation,
            warning,
            clientId: senderId,
            sourceLang: message.detectedLang || '', // 🟨 if available
            targetLang: targetLang
          });

          const ownMessage = JSON.stringify({
            type: 'final',
            speaker: 'you',
            original,
            text: cleaned || original,
            translation,
            warning,
            clientId: senderId,
            sourceLang: message.detectedLang || 'en',
            targetLang: targetLang
          });

          for (const client of rooms.get(ws.roomId || 'default') || []) {
            if (client.readyState !== WebSocket.OPEN) continue;

            console.log("📤 Sending message to client:", client === ws ? ownMessage : broadcastMessage);

            client.send(client === ws ? ownMessage : broadcastMessage);

            console.log('📤 Broadcast complete for message above.\n');

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
