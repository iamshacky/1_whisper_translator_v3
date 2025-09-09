// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// auto-rejoin hooks, and lazy camera toggle. One RTCPeerConnection per peerId.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// 🔗 Mesh state
const pcByPeer = new Map();              // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();    // peerId -> MediaStream
const pendingICEByPeer = new Map();      // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();          // peerId -> boolean

let localStream = null;
let _audioSender = null;
let _videoSender = null;
let _videoTx = null;
let _localVideoTrack = null;
let _cameraOn = false;

let _sendSignal = null;
let _started = false;
let _selfId = null; // used for deterministic “polite” selection

// 🔔 external subscriber for “mesh went idle”
let _onMeshIdle = null;

// --------------------------------------------
// Helpers
// --------------------------------------------
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
    _started = false; // ← important so future offers will show Accept, and Join will dial.
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
  if (inboundOffer) return true;            // callee is polite for perfect negotiation
  if (!_selfId) return false;
  // Deterministic tie-break: the lexicographically larger id is polite
  return String(_selfId) > String(peerId);
}

// --------------------------------------------
// Peer factory
// --------------------------------------------
function ensurePeerConnection(peerId) {
  if (pcByPeer.has(peerId)) return pcByPeer.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // --- ICE
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { candidate: e.candidate.toJSON() });
    }
  };

  // --- Track
  pc.ontrack = (e) => {
    let stream = remoteStreamByPeer.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreamByPeer.set(peerId, stream);
    }
    stream.addTrack(e.track);

    if (e.track.kind === 'audio') {
      const audioEl = document.getElementById('rtc-remote-audio');
      if (audioEl && audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        audioEl.play?.().catch(() => {});
      }
    }
    if (e.track.kind === 'video') {
      UI_addVideoTile(peerId, stream, { label: labelForPeer(peerId), muted: true });
    }
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

  // --- Negotiation
  pc.onnegotiationneeded = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    } catch (e) {
      console.warn('[mesh] negotiationneeded failed:', e);
    }
  };

  // --- Baseline senders
  (async () => { await ensureBaseTransceivers(pc); })().catch(() => {});

  pcByPeer.set(peerId, pc);
  return pc;
}

function closePeer(peerId) {
  const pc = pcByPeer.get(peerId);
  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { pc?.close?.(); } catch {}
  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  try { UI_removeVideoTile?.(peerId); } catch {}
  recomputeStartActive();
}

// --------------------------------------------
// Public API
// --------------------------------------------
export function RTC_setSignalSender(fn) {
  _sendSignal = typeof fn === 'function' ? fn : null;
}

export function RTC_setSelfId(id) {
  _selfId = id || null;
}

export function RTC_onMeshIdle(cb) {
  _onMeshIdle = typeof cb === 'function' ? cb : null;
}

export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

// -- Start peer
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  if (inboundOffer) {
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    const bucket = ensurePending(peerId);
    for (const cand of [...pendingCandidates, ...bucket]) {
      try { await pc.addIceCandidate(cand); } catch {}
    }
    bucket.length = 0;
  } else {
    if (!pc.localDescription && pc.signalingState === 'stable') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    }
  }
}

// -- Handle signal
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  const polite = !!politeByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      const collision = pc.signalingState !== 'stable';
      const ignore = !polite && collision;
      if (ignore) return;
      if (collision) {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);
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
  }
}

// -- Hang up
export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

export function RTC_teardownAll() {
  for (const id of Array.from(pcByPeer.keys())) closePeer(id);
  try { localStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  localStream = null;
  _cameraOn = false;
  _localVideoTrack = null;
  _videoSender = null;
  _videoTx = null;
  _audioSender = null;
  _started = false;
  RTC_setStartActive(false);
}

// -- Camera toggle
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    try { await _videoSender?.replaceTrack(null); } catch {}
    try { _localVideoTrack?.stop(); } catch {}
    _localVideoTrack = null;
    try { UI_removeVideoTile?.('local'); } catch {}
    _cameraOn = false;
    return false;
  }

  if (enabled && !_cameraOn) {
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = camStream.getVideoTracks();
    if (!track) return false;

    _localVideoTrack = track;
    if (!localStream) localStream = new MediaStream();
    try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
    localStream.addTrack(track);

    if (!_videoTx) {
      const pc = [...pcByPeer.values()][0]; // attach to first peer for baseline
      if (pc) {
        _videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
        _videoSender = _videoTx.sender;
      }
    }
    await _videoSender?.replaceTrack(track);

    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }

  return _cameraOn;
}

// -- Mic toggle
export function RTC_setMicEnabled(enabled) {
  try {
    const t = _audioSender?.track;
    if (t) t.enabled = !!enabled;
    const locals = localStream?.getAudioTracks?.() || [];
    locals.forEach(a => a.enabled = !!enabled);
    return t?.enabled || locals[0]?.enabled || false;
  } catch {
    return false;
  }
}

// --------------------------------------------
// Base transceivers
// --------------------------------------------
async function ensureBaseTransceivers(pc) {
  if (_audioSender && _videoTx) return;

  // audio
  if (!_audioSender) {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream = localStream || new MediaStream();
    const [track] = mic.getAudioTracks();
    if (track) localStream.addTrack(track);
    const tx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    _audioSender = tx.sender;
    await _audioSender.replaceTrack(track || null);
  }

  // video (empty baseline)
  if (!_videoTx) {
    _videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    _videoSender = _videoTx.sender;
  }
}
