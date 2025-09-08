// modules/webrtc/client/signaling.js
// WS for signaling & presence, with safe send + proper 'to' filtering + close/open hooks.

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const wsUrl = `${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`;

  const ws = new WebSocket(wsUrl);
  console.log('[webrtc/signaling] opening WS →', wsUrl, ' clientId=', clientId);

  // Subscribers
  const signalHandlers = new Set();    // fn({ from, to?, payload })
  const presenceHandlers = new Set();  // fn({ participants })
  const openHandlers = new Set();      // fn()
  const closeHandlers = new Set();     // fn(evt)

  // safe sender (queues till OPEN once)
  function safeSend(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    const sendNow = () => {
      try { ws.send(JSON.stringify(base)); }
      catch (e) { console.warn('[webrtc/signaling] send failed:', e); }
    };
    if (ws.readyState === WebSocket.OPEN) sendNow();
    else ws.addEventListener('open', sendNow, { once: true });
  }

  ws.onopen = () => {
    console.log('[webrtc/signaling] WS open. clientId =', clientId);
    safeSend('presence-join', { user_id: null, username: 'Someone' });
    openHandlers.forEach(h => { try { h(); } catch {} });
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    // Only accept messages for this room
    if (msg?.room !== roomId) return;

    // Filter by 'to' when present
    if (msg?.kind === 'webrtc-signal') {
      if (msg.from === clientId) return;            // ignore self-loop
      if (msg.to && msg.to !== clientId) return;    // not for me
      signalHandlers.forEach(h => h({ from: msg.from, to: msg.to, payload: msg.payload }));
      return;
    }

    if (msg?.kind === 'presence-sync') {
      presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      return;
    }
  };

  ws.onerror = (e) => console.warn('[webrtc/signaling] WS error', e);
  ws.onclose = (e) => {
    console.log('[webrtc/signaling] WS closed', e.code, e.reason || '');
    closeHandlers.forEach(h => { try { h(e); } catch {} });
  };

  // Public API
  function sendSignal(payload) { safeSend('webrtc-signal', { payload }); }
  function onSignal(fn) { signalHandlers.add(fn); return () => signalHandlers.delete(fn); }
  function sendPresenceJoin({ user_id = null, username = 'Someone' } = {}) { safeSend('presence-join', { user_id, username }); }
  function requestPresenceSnapshot() { safeSend('presence-request', {}); }
  function onPresence(fn) { presenceHandlers.add(fn); return () => presenceHandlers.delete(fn); }
  function onOpen(fn) { openHandlers.add(fn); return () => openHandlers.delete(fn); }
  function onClose(fn) { closeHandlers.add(fn); return () => closeHandlers.delete(fn); }

  return { sendSignal, onSignal, sendPresenceJoin, requestPresenceSnapshot, onPresence, onOpen, onClose, clientId, ws };
}
