// modules/webrtc/client/signaling.js
// Single WS for both signaling & presence

export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId =
    (crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  const ws = new WebSocket(
    `${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`
  );

  const signalHandlers = new Set();    // ({ from, payload })
  const presenceHandlers = new Set();  // ({ participants })

  // (optional) remember the last presence payload so you can re-announce after reconnects
  let lastPresence = null;

  ws.onopen = () => {
    console.log(`🟩 WS open (room=${roomId}, clientId=${clientId})`);
    // If we already announced presence earlier, re-announce (safe no-op on server)
    if (lastPresence) {
      try { ws.send(JSON.stringify({ kind: 'presence-join', room: roomId, from: clientId, ...lastPresence })); } catch {}
      try { ws.send(JSON.stringify({ kind: 'presence-request', room: roomId, from: clientId })); } catch {}
    }
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      if (msg?.kind === 'webrtc-signal' && msg.room === roomId && msg.from !== clientId) {
        signalHandlers.forEach(h => h({ from: msg.from, payload: msg.payload }));
      }

      if (msg?.kind === 'presence-sync' && msg.room === roomId) {
        presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      }
    } catch (e) {
      console.warn('⚠️ signaling onmessage parse error:', e);
    }
  };

  ws.onerror = (e) => {
    console.warn('⚠️ WS error:', e);
  };

  ws.onclose = (e) => {
    console.warn(`🟡 WS closed (code=${e.code}, reason="${e.reason || ''}")`);
  };

  function send(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    const payload = JSON.stringify(base);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    } else {
      ws.addEventListener('open', () => {
        try { ws.send(payload); } catch {}
      }, { once: true });
    }
  }

  function sendSignal(payload) {
    send('webrtc-signal', { payload });
  }

  function sendPresenceJoin({ user_id = null, username = 'Someone' } = {}) {
    lastPresence = { user_id, username };
    send('presence-join', lastPresence);
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

  return {
    sendSignal,
    onSignal,
    sendPresenceJoin,
    requestPresenceSnapshot,
    onPresence,
    clientId,
    ws
  };
}

