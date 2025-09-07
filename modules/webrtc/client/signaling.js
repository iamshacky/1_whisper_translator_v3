// start__targeted_signaling_with_to
// modules/webrtc/client/signaling.js
// Single WS for signaling + presence, now with {from,to} routing.

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const ws = new WebSocket(`${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`);

  const signalHandlers = new Set();    // ({from, to, payload})
  const presenceHandlers = new Set();  // ({participants})

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      if (msg?.kind === 'webrtc-signal' && msg.room === roomId) {
        // deliver only if targeted to me (or broadcast with no 'to')
        const to = msg.payload?.to || null;
        if (!to || to === clientId) {
          signalHandlers.forEach(h => h({ from: msg.from, to, payload: msg.payload }));
        }
      }

      if (msg?.kind === 'presence-sync' && msg.room === roomId) {
        presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      }
    } catch {}
  };

  function send(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(base));
    else ws.addEventListener('open', () => ws.send(JSON.stringify(base)), { once: true });
  }

  // 👉 Now supports optional 'to'
  function sendSignal(payload, to = null) {
    const enriched = to ? { ...payload, to } : payload;
    send('webrtc-signal', { payload: enriched });
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
// end__targeted_signaling_with_to
