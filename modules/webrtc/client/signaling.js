/* Start__targeted_signaling_support */
// Allow addressing a specific peer (to) and ignore signals not meant for me.

// Put this above RTC_setupSignaling (or inside, above sendSignal)
function normalizeSignalPayload(p) {
  if (!p) return {};
  // SDP offer/answer (RTCSessionDescription or init-like)
  if (typeof p === 'object' && ('sdp' in p || 'type' in p)) {
    return { type: p.type, sdp: p.sdp };
  }
  // ICE candidate (ensure plain init shape)
  if (typeof p === 'object' && ('candidate' in p || 'sdpMid' in p || 'sdpMLineIndex' in p || 'usernameFragment' in p)) {
    return {
      candidate: p.candidate ?? null,
      sdpMid: p.sdpMid ?? null,
      sdpMLineIndex: p.sdpMLineIndex ?? null,
      usernameFragment: p.usernameFragment ?? null
    };
  }
  // Last resort: deep-clone to strip prototypes/non-enumerables where possible
  try { return JSON.parse(JSON.stringify(p)); } catch { return { ...p }; }
}

/* Start__tunnel_target_inside_payload_and_filter_on_receive */
export function RTC_setupSignaling(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const clientId = crypto.randomUUID();

  console.log('[RTC] signaling clientId =', clientId, 'room =', roomId);

  const ws = new WebSocket(
    `${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`
  );

  const signalHandlers = new Set();    // ({from, payload})
  const presenceHandlers = new Set();  // ({participants})

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      if (msg?.kind === 'webrtc-signal' && msg.room === roomId && msg.from !== clientId) {
        // Broadcast mode: deliver everything (offer/answer/candidates) to everyone else.
        signalHandlers.forEach(h => h({ from: msg.from, payload: msg.payload || {} }));
      }

      if (msg?.kind === 'presence-sync' && msg.room === roomId) {
        presenceHandlers.forEach(h => h({ participants: msg.participants || [] }));
      }
    } catch (e) {
      console.warn('[RTC] signaling onmessage parse error:', e);
    }
  };

  function send(kind, data = {}) {
    const base = { kind, room: roomId, from: clientId, ...data };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(base));
    } else {
      ws.addEventListener('open', () => ws.send(JSON.stringify(base)), { once: true });
    }
  }

  function sendSignal(payload) {
    // Broadcast to room (server relays to everyone except me)
    console.log('[RTC] sendSignal:', payload?.type || Object.keys(payload || {}));
    send('webrtc-signal', { payload });
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
/* End__tunnel_target_inside_payload_and_filter_on_receive */
