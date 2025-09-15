// modules/webrtc/server/handlers.js
// Thin façade so the core wsHandler can delegate WebRTC bits here,
// without changing your current socket topology or behavior.

/**
 * Relay WebRTC signaling to other clients in the same room,
 * respecting deleted/unregistered room guards.
 */
export async function WEB__handleSignalMessage({
  ws,
  rooms,
  msg,                 // parsed JSON with { kind:'webrtc-signal', payload }
  isRoomValid,         // async (roomId) => boolean
  deletedRooms         // Set<string>
}) {
  const roomId = ws.roomId || 'default';

  // 🧱 Guards: deleted or never registered → drop
  if (deletedRooms?.has?.(roomId)) {
    console.warn(`🔒 Blocked signaling in deleted room "${roomId}"`);
    return;
  }
  const valid = await isRoomValid(roomId);
  if (!valid) {
    console.warn(`🔒 Blocked signaling in unregistered room "${roomId}"`);
    return;
  }

  const payload = {
    kind: 'webrtc-signal',
    room: roomId,
    from: ws.clientId,
    payload: msg?.payload
  };

  const peers = rooms.get(roomId) || new Set();
  for (const client of peers) {
    if (client !== ws && client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(JSON.stringify(payload));
    }
  }
}

/**
 * Handle presence join/request inside the same containment boundary.
 * `getRoomParticipants` returns a Map<clientId, { user_id, username }>
 * `broadcastPresence(roomId)` sends the standard presence-sync to all peers.
 */
export async function WEB__handlePresenceMessage({
  ws,
  msg,                           // { kind:'presence-join' | 'presence-request', ... }
  isRoomValid,
  deletedRooms,
  getRoomParticipants,           // (roomId) => Map
  broadcastPresence              // (roomId) => void
}) {
  const roomId = ws.roomId || 'default';

  // 🔒 Same guards as signaling
  if (deletedRooms?.has?.(roomId) || !(await isRoomValid(roomId))) {
    if (msg?.kind === 'presence-join') {
      console.warn(`🔒 Blocked presence join in room "${roomId}" (deleted/unregistered)`);
    }
    return;
  }

  if (msg?.kind === 'presence-join') {
    const { user_id = null, username = 'Someone' } = msg;
    const roomParts = getRoomParticipants(roomId);
    roomParts.set(ws.clientId, { user_id, username });
    broadcastPresence(roomId);
    return;
  }

  if (msg?.kind === 'presence-request') {
    const roomParts = getRoomParticipants(roomId);
    const list = Array.from(roomParts.entries()).map(([clientId, info]) => ({
      clientId,
      user_id: info?.user_id ?? null,
      username: info?.username || 'Someone'
    }));
    ws.send(JSON.stringify({ kind: 'presence-sync', room: roomId, participants: list }));
    return;
  }
}
