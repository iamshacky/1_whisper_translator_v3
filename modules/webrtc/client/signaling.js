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

  // 🧭 DEBUG: who am I?
  console.log('[RTC] signaling clientId =', clientId, 'room =', roomId);

  const ws = new WebSocket(`${protocol}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(clientId)}`);

  const signalHandlers = new Set();    // ({from, payload})
  const presenceHandlers = new Set();  // ({participants})

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      if (msg?.kind === 'webrtc-signal' && msg.room === roomId && msg.from !== clientId) {
        const p = msg.payload || {};
        const toId = p.__to || null;

        // 🧭 DEBUG: what did we receive and who is it for?
        console.log('[RTC] onmessage: webrtc-signal from=', msg.from, 'to=', toId || '(broadcast)', 'type=', p?.type || Object.keys(p));

        if (toId && toId !== clientId) return;  // not for me → ignore
        signalHandlers.forEach(h => h({ from: msg.from, payload: p }));
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

  // 🎯 embed target into payload (__to) — server relays as-is
  function sendSignal(payload, to = null) {
    // ⬇️ NEW: make sure we keep type/sdp/candidate properties
    const base = normalizeSignalPayload(payload);
    if (to) base.__to = to;

    console.log('[RTC] sendSignal:', base?.type || Object.keys(base), '→ to:', to || '(broadcast)');

    send('webrtc-signal', { payload: base });
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

