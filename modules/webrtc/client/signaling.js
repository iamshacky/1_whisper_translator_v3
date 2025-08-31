// modules/webrtc/client/signaling.js
// Shared WS for signaling + presence. Server relays to room; we filter by 'to' on the client.

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const ws = new WebSocket(`${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`);

  const signalHandlers = new Set();    // ({from, payload})
  const presenceHandlers = new Set();  // ({participants})

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      if (msg?.kind === 'webrtc-signal' && msg.room === roomId) {
        // Broadcast style; payload may include 'to'. Deliver if no 'to' or 'to' is me.
        const to = msg.payload?.to;
        if (!to || to === clientId) {
          signalHandlers.forEach(h => h({ from: msg.from, payload: msg.payload }));
        }
      }

      if (msg?.kind === 'presence-sync' && msg.room === roomId) {
        presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      }
    } catch {}
  };

  function send(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(base));
    } else {
      ws.addEventListener('open', () => ws.send(JSON.stringify(base)), { once: true });
    }
  }

  function sendSignal(payload) { send('webrtc-signal', { payload }); }
  function sendPresenceJoin({ user_id = null, username = 'Someone' } = {}) { send('presence-join', { user_id, username }); }
  function requestPresenceSnapshot() { send('presence-request', {}); }

  function onSignal(fn)   { signalHandlers.add(fn);   return () => signalHandlers.delete(fn); }
  function onPresence(fn) { presenceHandlers.add(fn); return () => presenceHandlers.delete(fn); }

  return { sendSignal, onSignal, sendPresenceJoin, requestPresenceSnapshot, onPresence, clientId, ws };
}
