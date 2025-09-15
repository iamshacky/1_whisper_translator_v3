// server/src/controllers/wsHandler.js
import WebSocket from 'ws';
import { translateController } from './translate.js';
import { randomUUID } from 'crypto';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { deletedRooms } from '../lib/deletedRoomCache.js';
import { isRoomValid } from '../../../modules/room_manager_qr/server/model.js';

import { WEB__handleSignalMessage, WEB__handlePresenceMessage } from '../../../modules/webrtc/server/handlers.js';



const rooms = new Map(); // roomId → Set<WebSocket>
//const deletedRooms = new Set(); // 🧠 In-memory tombstone cache

const participants = new Map(); // roomId -> Map(clientId -> { user_id, username })



export function setupWebSocket(wss) {
  preloadDeletedRooms(); // ⬅️ Important!

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

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

    ws.on('message', async (message, isBinary) => {
      console.log(`[WS] got ${isBinary ? 'binary' : 'text'} from ${clientId}`);

      try {
        if (isBinary) {
          // ✅ Use the canonical room id we already stored
          const roomId = ws.roomId || 'default';

          if (deletedRooms.has(roomId)) {
            console.warn(`❌ Preview rejected — deleted room: "${roomId}"`);
            return;
          }

          const isValid = await isRoomValid(roomId);
          if (!isValid) {
            console.warn(`🚫 Preview rejected — unregistered room: "${roomId}"`);
            ws.send(JSON.stringify({ error: "This room was never created via the QR system." }));
            return;
          }

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
            room: ws.roomId
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
          const parsed = JSON.parse(message);

          /* Start wsHandler.js__insert_after_parsed_JSON (delegated) */
          if (parsed?.kind === 'webrtc-signal') {
            await WEB__handleSignalMessage({
              ws,
              rooms,
              msg: parsed,
              isRoomValid,
              deletedRooms
            });
            return; // important: don't treat this as a chat message
          }
          /* End wsHandler.js__insert_after_parsed_JSON */

          // ⬇️ Your original duplicate block — kept; it also delegates now
          if (parsed?.kind === 'webrtc-signal') {
            await WEB__handleSignalMessage({
              ws,
              rooms,
              msg: parsed,
              isRoomValid,
              deletedRooms
            });
            return; // do not treat as chat message
          }

          /* Start wsHandler.js__presence_after_parsed (delegated) */
          if (parsed?.kind === 'presence-join' || parsed?.kind === 'presence-request') {
            await WEB__handlePresenceMessage({
              ws,
              msg: parsed,
              isRoomValid,
              deletedRooms,
              getRoomParticipants,
              broadcastPresence
            });
            return;
          }
          /* End wsHandler.js__presence_after_parsed */

          if (parsed.room && deletedRooms.has(parsed.room)) {
            console.warn(`❌ Final message rejected — deleted room: "${parsed.room}"`);
            console.log(`🔒 Rejected message:`, parsed);
            return;
          }

          // ✅ Block messages to rooms that were never officially created
          const valid = await isRoomValid(parsed.room);
          if (!valid) {
            console.warn(`🚫 Final message rejected — unregistered room: "${parsed.room}"`);
            console.log(`🧯 Message attempt blocked:`, parsed);
            ws.send(JSON.stringify({ error: "This room was never created via the QR system." }));
            return;
          }

          const {
            original,
            cleaned = '',
            translation,
            warning = '',
            clientId: senderId,
            moderatorSuggestion = '',
            inputMethod = 'text',
            sourceLang = '',
            targetLang: incomingTargetLang = '',
            room = ws.roomId,
            user = {}
          } = JSON.parse(message);

          console.log('🟦 Final message received:');
          console.log('   📝 original    :', original);
          console.log('   🧹 cleaned     :', cleaned || '(none)');
          console.log('   💬 suggestion  :', moderatorSuggestion || '(none)');
          console.log('   🌐 translation :', translation);
          console.log('   ⚠️ warning     :', warning || '(none)');
          console.log('   📥 inputMethod :', inputMethod);
          console.log('   👤 username    :', user?.username || '(none)');
          console.log('   🆔 user_id     :', user?.user_id || '(none)');
          console.log('   📩 from clientId:', senderId);

          const finalMessage = {
            type: 'final',
            original,
            text: cleaned || original,
            translation,
            warning,
            inputMethod,
            sourceLang,
            targetLang: incomingTargetLang || targetLang,
            user_id: user?.user_id || null,
            username: user?.username || null,
            clientId: senderId,
            room
          };

          for (const client of rooms.get(ws.roomId || 'default') || []) {
            if (client.readyState !== WebSocket.OPEN) continue;

            const enriched = {
              ...finalMessage,
              speaker: client === ws ? 'you' : 'them',
            };

            console.log("📤 Sending message to client:", enriched);
            client.send(JSON.stringify(enriched));
          }

          console.log('📤 Broadcast complete for message above.\n');
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

      // 👇 Presence cleanup
      const roomParts = getRoomParticipants(roomId);
      if (roomParts.delete(ws.clientId)) {
        broadcastPresence(roomId);
      }
    });
  });
}

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// 🔁 Load deleted rooms into memory on startup
async function preloadDeletedRooms() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const dbPath = path.join(__dirname, '../../../modules/persistence_sqlite/messages.db');
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    const rows = await db.all(`SELECT room FROM messages WHERE username = 'hide_url'`);
    for (const row of rows) {
      deletedRooms.add(row.room);
    }

    console.log(`🪦 Preloaded ${deletedRooms.size} deleted rooms into memory`);
  } catch (err) {
    console.error('❌ Failed to preload deleted rooms:', err);
  }
}


function getRoomParticipants(roomId) {
  if (!participants.has(roomId)) participants.set(roomId, new Map());
  return participants.get(roomId);
}

function broadcastPresence(roomId) {
  const list = Array.from(getRoomParticipants(roomId).entries()).map(([clientId, info]) => ({
    clientId,
    user_id: info.user_id || null,
    username: info.username || 'Someone'
  }));
  for (const client of rooms.get(roomId) || []) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ kind: 'presence-sync', room: roomId, participants: list }));
    }
  }
}

