// modules/webrtc/client/connection.js
// Clean 1:many mesh with per-peer RTCPeerConnections, perfect negotiation,
// per-peer transceivers, and camera/mic toggles applied across all peers.

import { UI_addVideoTile, UI_removeVideoTile } from './ui.js';

// -----------------------------------------------------------------------------
// Mesh state
// -----------------------------------------------------------------------------
const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream (remote)
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean (tie-break)
const makingOfferByPeer = new Map();        // peerId -> boolean (perfect-negotiation)
const sendersByPeer = new Map();            // peerId -> { audioSender, videoSender, videoTx }

// Local media shared across peers
let localMicStream = null;                  // MediaStream (audio only)
let localMicTrack = null;                   // MediaStreamTrack (kept to restore after mute)
let localCamTrack = null;                   // MediaStreamTrack (video)
let cameraOn = false;

let _sendSignal = null;
let _everStarted = false;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function ensureArrBucket(map, key) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
}

// SDP objects (RTCSessionDescription) → plain { type, sdp }
function toPlainSDP(desc) {
  if (!desc) return null;
  if (typeof desc.toJSON === 'function') return desc.toJSON();
  return { type: desc.type, sdp: String(desc.sdp || '') };
}

// ✅ Always send a **flat, plain** payload: { to, type:'offer'|'answer'|'candidate', ... }
function sendTo(peerId, payload) {
  if (!_sendSignal) return;

  let flat = null;

  if (payload && typeof payload.type === 'string' && (payload.type === 'offer' || payload.type === 'answer')) {
    const p = toPlainSDP(payload);
    flat = { type: p.type, sdp: p.sdp };
  } else if (payload && (payload.candidate || payload.type === 'candidate')) {
    const cand = payload.candidate && typeof payload.candidate === 'object' && typeof payload.candidate.toJSON === 'function'
      ? payload.candidate.toJSON()
      : payload.candidate || payload;
    flat = { type: 'candidate', candidate: cand };
  } else {
    flat = payload || {};
  }

  _sendSignal({ to: peerId, ...flat });
}

function getOrMakeRemoteStream(peerId) {
  if (!remoteStreamByPeer.has(peerId)) {
    remoteStreamByPeer.set(peerId, new MediaStream());
  }
  return remoteStreamByPeer.get(peerId);
}

async function ensureLocalMic() {
  if (localMicStream && localMicTrack) return localMicStream;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  localMicTrack = mic.getAudioTracks()[0] || null;
  localMicStream = new MediaStream(localMicTrack ? [localMicTrack] : []);
  return localMicStream;
}

function closePeer(peerId) {
  const pc = pcByPeer.get(peerId);
  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { pc?.close?.(); } catch {}
  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  makingOfferByPeer.delete(peerId);
  sendersByPeer.delete(peerId);
  try { UI_removeVideoTile?.(peerId); } catch {}
}

// Simple presence-based name lookup (populated by ui.js)
function lookupDisplayName(peerId) {
  try {
    const list = window.__lastPresence || [];
    const hit = list.find(p => p.clientId === peerId);
    return (hit?.username || '').trim() || 'Remote';
  } catch { return 'Remote'; }
}

// -----------------------------------------------------------------------------
// Peer factory
// -----------------------------------------------------------------------------
function makePeer(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  makingOfferByPeer.set(peerId, false);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { type: 'candidate', candidate: e.candidate.toJSON() });
    }
  };

  pc.ontrack = (e) => {
    const stream = getOrMakeRemoteStream(peerId);
    const already = stream.getTracks().some(t => t.id === e.track.id);
    if (!already) stream.addTrack(e.track);

    // Label with the best-known display name at this moment
    const label = lookupDisplayName(peerId);
    UI_addVideoTile(peerId, stream, { label, muted: true });

    // Also keep remote audio flowing via the hidden/global element (already muted per-tile)
    if (e.track.kind === 'audio') {
      const audioEl = document.getElementById('rtc-remote-audio');
      if (audioEl && audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        audioEl.play?.().catch(() => {});
      }
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`[mesh] ${peerId} state:`, pc.connectionState);
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      closePeer(peerId);
    }
  };

  pc.onnegotiationneeded = async () => {
    let making = makingOfferByPeer.get(peerId) || false;
    if (making) return;
    try {
      makingOfferByPeer.set(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const desc = toPlainSDP(pc.localDescription);
      sendTo(peerId, desc);
    } catch (err) {
      console.warn('[mesh] negotiationneeded failed:', err);
    } finally {
      makingOfferByPeer.set(peerId, false);
    }
  };

  pcByPeer.set(peerId, pc);
  return pc;
}

function ensurePeer(peerId) {
  return pcByPeer.get(peerId) || makePeer(peerId);
}

// Ensure base transceivers and bind local media (per-peer)
async function ensureBaseTransceivers(peerId) {
  const pc = ensurePeer(peerId);
  let senders = sendersByPeer.get(peerId);
  if (senders?.audioSender && senders?.videoSender) return;

  senders = senders || {};
  // Audio
  const mic = await ensureLocalMic();
  let aTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  senders.audioSender = aTx.sender;
  await senders.audioSender.replaceTrack(localMicTrack || null);

  // Video baseline (sendrecv)
  let vTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  senders.videoTx = vTx;
  senders.videoSender = vTx.sender;

  if (cameraOn && localCamTrack) {
    await senders.videoSender.replaceTrack(localCamTrack);
  } else {
    await senders.videoSender.replaceTrack(null);
  }

  sendersByPeer.set(peerId, senders);
  return pc;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
export function RTC_setSignalSender(fn) {
  _sendSignal = (typeof fn === 'function') ? fn : null;
}

export function RTC_isStarted() { return _everStarted; }
export function RTC_isCameraOn() { return cameraOn; }

// Start/connect to a peer (optionally with an inbound offer)
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _everStarted = true;

  const pc = ensurePeer(peerId);
  await ensureBaseTransceivers(peerId);

  politeByPeer.set(peerId, !!inboundOffer);

  if (inboundOffer) {
    try {
      const making = makingOfferByPeer.get(peerId) || false;
      if (making) {
        await pc.setLocalDescription({ type: 'rollback' });
        makingOfferByPeer.set(peerId, false);
      }
      await pc.setRemoteDescription(inboundOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const desc = toPlainSDP(pc.localDescription);
      sendTo(peerId, desc);

      const bucket = ensureArrBucket(pendingICEByPeer, peerId);
      const all = [...pendingCandidates, ...bucket];
      for (const c of all) {
        try { await pc.addIceCandidate(c); } catch {}
      }
      bucket.length = 0;
    } catch (err) {
      console.warn('[mesh] error handling inbound offer from', peerId, err);
    }
  } else {
    try {
      makingOfferByPeer.set(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const desc = toPlainSDP(pc.localDescription);
      sendTo(peerId, desc);
    } catch (err) {
      console.warn('[mesh] proactive offer failed:', err);
    } finally {
      makingOfferByPeer.set(peerId, false);
    }
  }
}

// Handle a signaling message from a peer
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeer(peerId);
  await ensureBaseTransceivers(peerId);

  // Defensive: accept nested { payload: {...} } once
  const msg = (payload && payload.payload && !payload.type && !payload.candidate)
    ? payload.payload
    : payload;

  const polite = !!politeByPeer.get(peerId);

  try {
    if (msg.type === 'offer') {
      const making = makingOfferByPeer.get(peerId) || false;
      const collision = making || pc.signalingState !== 'stable';
      const ignore = !polite && collision;
      if (ignore) return;

      if (collision) {
        await pc.setLocalDescription({ type: 'rollback' });
        makingOfferByPeer.set(peerId, false);
      }

      await pc.setRemoteDescription(msg);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const desc = toPlainSDP(pc.localDescription);
      sendTo(peerId, desc);
    } else if (msg.type === 'answer') {
      await pc.setRemoteDescription(msg);
    } else if (msg.type === 'candidate' || msg.candidate) {
      const cand = msg.candidate || msg;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(cand).catch(() => ensureArrBucket(pendingICEByPeer, peerId).push(cand));
      } else {
        ensureArrBucket(pendingICEByPeer, peerId).push(cand);
      }
    } else {
      console.warn('[mesh] unknown signal payload shape from', from, msg);
    }
  } catch (e) {
    console.warn('[mesh] handleSignal error for', peerId, e);
  }
}

// Hang up a single peer
export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

// Teardown all
export function RTC_teardownAll() {
  for (const id of Array.from(pcByPeer.keys())) closePeer(id);

  try { localMicStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  try { localCamTrack?.stop?.(); } catch {}
  localMicStream = null;
  localMicTrack = null;
  localCamTrack = null;
  cameraOn = false;
  _everStarted = false;
}

// Toggle camera across all peers
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && cameraOn) {
    try { localCamTrack?.stop?.(); } catch {}
    localCamTrack = null;
    cameraOn = false;

    for (const [, senders] of sendersByPeer.entries()) {
      try { await senders.videoSender?.replaceTrack(null); } catch {}
    }
    try { UI_removeVideoTile?.('local'); } catch {}
    return false;
  }

  if (enabled && !cameraOn) {
    const cam = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = cam.getVideoTracks();
    if (!track) return false;

    localCamTrack = track;
    cameraOn = true;

    for (const [peerId] of pcByPeer.entries()) {
      await ensureBaseTransceivers(peerId);
      const senders = sendersByPeer.get(peerId);
      await senders.videoSender?.replaceTrack(localCamTrack);
    }

    const localStream = new MediaStream([localCamTrack]);
    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    return true;
  }

  return cameraOn;
}

// Toggle mic enable/disable (hard mute by swapping sender track)
export function RTC_setMicEnabled(enabled) {
  try {
    // Ensure we have a mic track cached for restoration
    if (!localMicTrack && localMicStream) {
      localMicTrack = localMicStream.getAudioTracks?.()[0] || null;
    }

    for (const [, senders] of sendersByPeer.entries()) {
      // swap track on sender so remote truly stops receiving audio
      if (enabled) {
        // restore original mic track
        senders.audioSender?.replaceTrack(localMicTrack || null);
        if (localMicTrack) localMicTrack.enabled = true;
      } else {
        // hard mute
        senders.audioSender?.replaceTrack(null);
        if (localMicTrack) localMicTrack.enabled = false;
      }
    }

    // Keep local stream track state in sync too (for analyzers/meters if you add them)
    (localMicStream?.getAudioTracks?.() || []).forEach(a => (a.enabled = !!enabled));

    return !!enabled;
  } catch (e) {
    console.warn('RTC_setMicEnabled error:', e);
    return false;
  }
}
