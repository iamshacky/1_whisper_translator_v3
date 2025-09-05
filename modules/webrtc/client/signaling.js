/* Start__targeted_signaling_support */
// Allow addressing a specific peer (to) and ignore signals not meant for me.

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const ws = new WebSocket(`${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`);

  const signalHandlers = new Set();    // ({from, to, payload})
  const presenceHandlers = new Set();  // ({participants})

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      if (msg?.kind === 'webrtc-signal' && msg.room === roomId && msg.from !== clientId) {
        // If a specific recipient is indicated, drop if it's not me.
        if (msg.to && msg.to !== clientId) return;
        signalHandlers.forEach(h => h({ from: msg.from, to: msg.to || null, payload: msg.payload }));
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

  // ⬇️ New: optional `to` for targeted signaling
  function sendSignal(payload, to = null) {
    send('webrtc-signal', { payload, to });
  }

  function sendPresenceJoin({ user_id = null, username = 'Someone' } = {}) {
    send('presence-join', { user_id, username });
  }

  function requestPresenceSnapshot() {
    send('presence-request', {});
  }

  function onSignal(fn) {
    signalHandlers.add(fn);
    return () => signalHandlers.delete(fn);
  }

  function onPresence(fn) {
    presenceHandlers.add(fn);
    return () => presenceHandlers.delete(fn);
  }

  return { sendSignal, onSignal, sendPresenceJoin, requestPresenceSnapshot, onPresence, clientId, ws };
}
/* End__targeted_signaling_support */
