// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// per-peer senders/transceivers (no single-PC assumptions), auto-rejoin,
// and per-tile audio routing. One RTCPeerConnection per peerId.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// ────────────────────────────────────────────────────────────────────────────
// Mesh state
// ────────────────────────────────────────────────────────────────────────────
const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean

// Per-peer local senders/transceivers (so every peer receives our mic/cam)
const sendersByPeer = new Map();            // peerId -> { audioTx, videoTx, audioSender, videoSender }

// Per-peer negotiation state & readiness
// peerId -> { makingOffer, needNegotiation, isSettingRemote, ready: Promise<void> }
const negoStateByPeer = new Map();

let localStream = null;                     // for local preview tile
let _localAudioTrack = null;
let _localVideoTrack = null;
let _cameraOn = false;

let _sendSignal = null;
let _started = false;
let _selfId = null;                         // deterministic polite selection

// 🔔 external subscriber for “mesh went idle”
let _onMeshIdle = null;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}

function sendTo(peerId, payload) {
  _sendSignal?.({ to: peerId, payload });
}

function anyPeerConnected() {
  return Array.from(pcByPeer.values()).some(pc => pc.connectionState === 'connected');
}

function anyPeerConnecting() {
  return Array.from(pcByPeer.values()).some(pc =>
    pc.connectionState === 'connecting' || pc.connectionState === 'new'
  );
}

function recomputeStartActive() {
  const connected = anyPeerConnected();
  RTC_setStartActive(connected);

  // If literally nothing connected/connecting, we’re idle.
  if (!connected && !anyPeerConnecting()) {
    _started = false; // ← enables Accept-as-Join on next inbound
    _onMeshIdle?.();
  }
}

function labelForPeer(peerId) {
  try {
    const list = window.__lastPresence || [];
    const hit = list.find(p => p.clientId === peerId);
    return hit?.username ? hit.username : 'Remote';
  } catch {
    return 'Remote';
  }
}

function computePolite(peerId, inboundOffer = false) {
  if (inboundOffer) return true; // callee = polite (perfect negotiation)
  if (!_selfId) return false;
  return String(_selfId) > String(peerId); // deterministic tie-break
}

// ────────────────────────────────────────────────────────────────────────────
async function ensureLocalAudioTrack() {
  if (_localAudioTrack && _localAudioTrack.readyState === 'live') return _localAudioTrack;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  const [track] = mic.getAudioTracks();
  _localAudioTrack = track || null;

  if (_localAudioTrack) {
    if (!localStream) localStream = new MediaStream();
    localStream.getAudioTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(_localAudioTrack);
  }
  return _localAudioTrack;
}

async function ensureLocalVideoTrack() {
  if (_localVideoTrack && _localVideoTrack.readyState === 'live') return _localVideoTrack;
  const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
  const [track] = camStream.getVideoTracks();
  _localVideoTrack = track || null;

  if (_localVideoTrack) {
    if (!localStream) localStream = new MediaStream();
    localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(_localVideoTrack);
  }
  return _localVideoTrack;
}

// ────────────────────────────────────────────────────────────────────────────
// Peer factory
// ────────────────────────────────────────────────────────────────────────────
function ensurePeerConnection(peerId) {
  if (pcByPeer.has(peerId)) return pcByPeer.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // negotiation state & “base transceivers ready”
  if (!negoStateByPeer.has(peerId)) {
    negoStateByPeer.set(peerId, {
      makingOffer: false,
      needNegotiation: false,
      isSettingRemote: false,
      ready: null, // set just below
    });
  }
  const st = negoStateByPeer.get(peerId);

  // --- ICE
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { candidate: e.candidate.toJSON() });
    }
  };

  // --- Track → per-peer MediaStream + tile
  pc.ontrack = (e) => {
    let stream = remoteStreamByPeer.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreamByPeer.set(peerId, stream);
    }
    stream.addTrack(e.track);
    UI_addVideoTile(peerId, stream, { label: labelForPeer(peerId), muted: true });
  };

  // --- State
  pc.onconnectionstatechange = () => {
    console.log(`[mesh] ${peerId} state:`, pc.connectionState);
    if (
      pc.connectionState === 'failed' ||
      pc.connectionState === 'closed' ||
      pc.connectionState === 'disconnected'
    ) {
      try { UI_removeVideoTile?.(peerId); } catch {}
    }
    recomputeStartActive();
  };

  // --- Negotiation (serialized; only after base transceivers are present)
  pc.onnegotiationneeded = async () => {
    try {
      await st.ready; // ensure audio then video transceivers are present
      await negotiate(peerId);
    } catch (e) {
      console.warn('[mesh] negotiationneeded failed:', e);
    }
  };

  pcByPeer.set(peerId, pc);

  // Precreate baseline transceivers to stabilize m-line order (audio then video).
  st.ready = (async () => { await ensureBaseTransceivers(peerId, pc); })();

  return pc;
}

function closePeer(peerId) {
  const pc = pcByPeer.get(peerId);

  // Stop local senders' tracks (safe if already stopped)
  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}

  // Close PC
  try { pc?.close?.(); } catch {}

  // Clear maps
  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  negoStateByPeer.delete(peerId);

  // Drop sender bundle (do not call replaceTrack on a closed pc)
  sendersByPeer.delete(peerId);

  // Remove tile
  try { UI_removeVideoTile?.(peerId); } catch {}

  recomputeStartActive();
}

// ────────────────────────────────────────────────────────────────────────────
async function negotiate(peerId) {
  const pc = pcByPeer.get(peerId);
  const st = negoStateByPeer.get(peerId);
  if (!pc || !st) return;

  // Only start an offer when completely stable and not already offering
  if (st.makingOffer || pc.signalingState !== 'stable') {
    st.needNegotiation = true;
    return;
  }

  try {
    st.makingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendTo(peerId, pc.localDescription);
  } catch (e) {
    console.warn('[mesh] negotiate() failed:', e);
  } finally {
    st.makingOffer = false;
    if (st.needNegotiation) {
      st.needNegotiation = false;
      if (pc.signalingState === 'stable') {
        negotiate(peerId).catch(() => {});
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
export function RTC_setSignalSender(fn) { _sendSignal = typeof fn === 'function' ? fn : null; }
export function RTC_setSelfId(id) { _selfId = id || null; }
export function RTC_onMeshIdle(cb) { _onMeshIdle = typeof cb === 'function' ? cb : null; }
export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

// -- Start peer
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  const st = negoStateByPeer.get(peerId);
  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  if (inboundOffer) {
    // IMPORTANT: ensure baseline transceivers exist BEFORE setting the remote offer.
    await st?.ready;
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    // Drain buffered ICE
    const bucket = ensurePending(peerId);
    for (const cand of [...pendingCandidates, ...bucket]) {
      try { await pc.addIceCandidate(cand); } catch {}
    }
    bucket.length = 0;
  } else {
    // Caller path: never offer before baseline transceivers exist
    await st?.ready;
    if (!pc.localDescription && pc.signalingState === 'stable') {
      await negotiate(peerId);
    }
  }
}

// -- Handle signal
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  const polite = !!politeByPeer.get(peerId);
  const st = negoStateByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      const collision = (st?.makingOffer === true) || pc.signalingState !== 'stable';
      const ignore = !polite && collision;
      if (ignore) return;
      if (collision) {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      // IMPORTANT: ensure baseline transceivers exist BEFORE SLD(offer)
      await st?.ready;
      st.isSettingRemote = true;
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);
      st.isSettingRemote = false;
    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(payload);
    } else if (payload.candidate) {
      try { await pc.addIceCandidate(payload); }
      catch { ensurePending(peerId).push(payload); }
    } else {
      console.log('[mesh] unknown signal payload shape from', peerId, payload);
    }
  } catch (e) {
    console.warn('[mesh] handleSignal error for', peerId, e);
    if (st) st.isSettingRemote = false;
  }
}

// -- Hang up
export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

export function RTC_teardownAll() {
  for (const id of Array.from(pcByPeer.keys())) closePeer(id);
  try { localStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  localStream = null;
  _localAudioTrack = null;
  _localVideoTrack = null;
  _cameraOn = false;
  _started = false;
  RTC_setStartActive(false);
}

// -- Camera toggle (apply to every peer’s videoSender)
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    try { _localVideoTrack?.stop(); } catch {}
    _localVideoTrack = null;

    // Detach from active senders (ignore errors if PCs are closing)
    for (const [, snd] of sendersByPeer) {
      try { await snd.videoSender?.replaceTrack(null); } catch {}
    }
    try { UI_removeVideoTile?.('local'); } catch {}
    _cameraOn = false;
    return false;
  }

  if (enabled && !_cameraOn) {
    const vTrack = await ensureLocalVideoTrack();
    if (!vTrack) return false;

    // Replace track on all peers that already have a video sender
    for (const [peerId, pc] of pcByPeer) {
      await ensureBaseTransceivers(peerId, pc); // ensure sender exists
      const snd = sendersByPeer.get(peerId);
      try { await snd?.videoSender?.replaceTrack(vTrack); } catch {}
    }

    // Local preview tile
    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }

  return _cameraOn;
}

// -- Mic toggle (toggle local track enabled; shared across senders)
export function RTC_setMicEnabled(enabled) {
  try {
    if (_localAudioTrack) _localAudioTrack.enabled = !!enabled;
    const locals = localStream?.getAudioTracks?.() || [];
    locals.forEach(a => a.enabled = !!enabled);
    return _localAudioTrack?.enabled ?? locals[0]?.enabled ?? false;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Base transceivers per peer (stabilize m-line and wire senders)
// ────────────────────────────────────────────────────────────────────────────
async function ensureBaseTransceivers(peerId, pc) {
  if (sendersByPeer.has(peerId)) return sendersByPeer.get(peerId);

  // Audio (m=0)
  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const audioSender = audioTx.sender;
  const aTrack = await ensureLocalAudioTrack();
  try { await audioSender.replaceTrack(aTrack || null); } catch {}

  // Video (m=1) — baseline transceiver; will carry track only when camera enabled
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  const videoSender = videoTx.sender;
  if (_localVideoTrack) {
    try { await videoSender.replaceTrack(_localVideoTrack); } catch {}
  } else {
    try { await videoSender.replaceTrack(null); } catch {}
  }

  const bundle = { audioTx, videoTx, audioSender, videoSender };
  sendersByPeer.set(peerId, bundle);
  return bundle;
}
