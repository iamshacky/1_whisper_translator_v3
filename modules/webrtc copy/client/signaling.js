// modules/webrtc/client/signaling.js
// Single WS for both signaling & presence, with safe send and correct server protocol.

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();
  const wsUrl = `${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`;

  const ws = new WebSocket(wsUrl);
  console.log('[webrtc/signaling] opening WS →', wsUrl, ' clientId=', clientId);

  // Subscribers
  const signalHandlers = new Set();    // fn({ from, payload })
  const presenceHandlers = new Set();  // fn({ participants })

  // --- safe sender (queues until OPEN once) ---
  function safeSend(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    const sendNow = () => {
      try {
        ws.send(JSON.stringify(base));
      } catch (e) {
        console.warn('[webrtc/signaling] send failed:', e);
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendNow();
    } else {
      ws.addEventListener('open', sendNow, { once: true });
    }
  }

  ws.onopen = () => {
    console.log('[webrtc/signaling] WS open. clientId =', clientId);
    // Early presence (harmless); init.js will send proper one too.
    safeSend('presence-join', { user_id: null, username: 'Someone' });
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    // Handle signaling
    if (msg?.kind === 'webrtc-signal' && msg.room === roomId && msg.from !== clientId) {
      // Some senders wrap like {to, payload}; unwrap to the inner SDP/ICE object.
      const raw = msg.payload;
      // If the message is targeted and it's not for me, ignore it (extra safety).
      if (raw && typeof raw === 'object' && 'to' in raw && raw.to && raw.to !== clientId) return;

      let inner = raw;
      if (raw && typeof raw === 'object' && 'payload' in raw && raw.payload) {
        inner = raw.payload; // unwrap wrapper { to, payload }
      }

      signalHandlers.forEach(h => h({ from: msg.from, payload: inner }));
      return;
    }

    // Presence snapshots
    if (msg?.kind === 'presence-sync' && msg.room === roomId) {
      presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      return;
    }
  };

  ws.onerror = (e) => console.warn('[webrtc/signaling] WS error', e);
  ws.onclose = (e) => console.log('[webrtc/signaling] WS closed', e.code, e.reason || '');

  // Public API (exact shape used by init.js)
  function sendSignal(payload) {
    // payload is an SDP/ICE or targeted wrapper from connection.js
    safeSend('webrtc-signal', { payload });
  }

  function onSignal(fn) {
    signalHandlers.add(fn);
    return () => signalHandlers.delete(fn);
  }

  function sendPresenceJoin({ user_id = null, username = 'Someone' } = {}) {
    safeSend('presence-join', { user_id, username });
  }

  function requestPresenceSnapshot() {
    safeSend('presence-request', {});
  }

  function onPresence(fn) {
    presenceHandlers.add(fn);
    return () => presenceHandlers.delete(fn);
  }

  return { sendSignal, onSignal, sendPresenceJoin, requestPresenceSnapshot, onPresence, clientId, ws };
}
