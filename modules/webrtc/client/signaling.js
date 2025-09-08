// modules/webrtc/client/signaling.js
// Single WS for both signaling & presence, with safe send and correct server protocol.
// Flattened webrtc payloads + onOpen helper.

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const wsUrl = `${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`;

  const ws = new WebSocket(wsUrl);
  console.log('[webrtc/signaling] opening WS →', wsUrl, ' clientId=', clientId);

  // Subscribers
  const signalHandlers = new Set();    // fn({ from, to?, payload })
  const presenceHandlers = new Set();  // fn({ participants })

  // --- safe sender (queues until OPEN once) ---
  function safeSend(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    const sendNow = () => {
      try { ws.send(JSON.stringify(base)); }
      catch (e) { console.warn('[webrtc/signaling] send failed:', e);
      }
    };
    if (ws.readyState === WebSocket.OPEN) sendNow();
    else ws.addEventListener('open', sendNow, { once: true });
  }

  ws.onopen = () => {
    console.log('[webrtc/signaling] WS open. clientId =', clientId);
    // Advertise presence immediately; init.js may re-send with real user info
    safeSend('presence-join', { user_id: null, username: 'Someone' });
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg?.room !== roomId) return;

    if (msg?.kind === 'webrtc-signal') {
      if (msg.from === clientId) return;           // ignore self
      if (msg.to && msg.to !== clientId) return;   // not for me

      // Accept flattened or legacy shapes
      const payload = msg.payload ?? (
        msg.type ? { type: msg.type, sdp: msg.sdp, candidate: msg.candidate } : null
      );
      if (!payload) return;

      signalHandlers.forEach(h => h({ from: msg.from, to: msg.to, payload }));
      return;
    }

    if (msg?.kind === 'presence-sync') {
      presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      return;
    }
  };

  ws.onerror = (e) => console.warn('[webrtc/signaling] WS error', e);
  ws.onclose = (e) => console.log('[webrtc/signaling] WS closed', e.code, e.reason || '');

  // Public API used by init.js / connection.js
  function sendSignal(obj) {
    // Expect a flattened payload: { to, type:'offer'|'answer'|'candidate', sdp?, candidate? }
    safeSend('webrtc-signal', obj);
  }
  function onSignal(fn) { signalHandlers.add(fn); return () => signalHandlers.delete(fn); }
  function sendPresenceJoin({ user_id = null, username = 'Someone' } = {}) { safeSend('presence-join', { user_id, username }); }
  function requestPresenceSnapshot() { safeSend('presence-request', {}); }
  function onPresence(fn) { presenceHandlers.add(fn); return () => presenceHandlers.delete(fn); }

  // ✅ Helper expected by your current init.js
  function onOpen(fn) {
    if (typeof fn !== 'function') return () => {};
    if (ws.readyState === WebSocket.OPEN) { try { fn(); } catch {} return () => {}; }
    const handler = () => { try { fn(); } catch {} };
    ws.addEventListener('open', handler, { once: true });
    return () => ws.removeEventListener('open', handler);
  }

  return {
    sendSignal, onSignal,
    sendPresenceJoin, requestPresenceSnapshot, onPresence,
    onOpen, // <-- added
    clientId, ws
  };
}
