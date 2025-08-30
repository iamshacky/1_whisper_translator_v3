// modules/webrtc/client/signaling.js
// Dedicated WebSocket for WebRTC signaling (scoped to room via query params)

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const ws = new WebSocket(`${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`);

  const handlers = new Set(); // functions receiving { from, payload }

  ws.onmessage = (ev) => {
    // We expect server to echo { kind:'webrtc-signal', from, payload, room }
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.kind === 'webrtc-signal' && msg.room === roomId && msg.from !== clientId) {
        handlers.forEach(h => h({ from: msg.from, payload: msg.payload }));
      }
    } catch {}
  };

  function sendSignal(payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        kind: 'webrtc-signal',
        room: roomId,
        from: clientId,
        payload
      }));
    } else {
      ws.addEventListener('open', () => sendSignal(payload), { once: true });
    }
  }

  function onSignal(fn) {
    handlers.add(fn);
    return () => handlers.delete(fn);
  }

  return { sendSignal, onSignal, clientId, ws };
}
