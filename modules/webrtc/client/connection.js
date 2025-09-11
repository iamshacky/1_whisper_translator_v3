// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// per-peer senders/transceivers (no single-PC assumptions), auto-rejoin,
// per-tile audio routing. One RTCPeerConnection per peerId.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// ────────────────────────────────────────────────────────────────────────────
// Mesh state
// ────────────────────────────────────────────────────────────────────────────
const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean
const makingOfferByPeer = new Map();        // peerId -> boolean (perfect negotiation)

// Per-peer local senders/transceivers (so every peer receives our mic/cam)
const sendersByPeer = new Map();            // peerId -> { audioTx, videoTx, audioSender, videoSender }

let localStream = null;                     // for rendering local preview tile
let _localAudioTrack = null;
let _localVideoTrack = null;
let _cameraOn = false;

let _sendSignal = null;
let _started = false;
let _selfId = null;                         // deterministic polite selection

// 🔔 external subscriber for “mesh went idle”
let _onMeshIdle = null;

// ────────────────────────────────────────────────────────────────────────────
// Helpers & debug
// ────────────────────────────────────────────────────────────────────────────
function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}
function sendTo(peerId, payload) { _sendSignal?.({ to: peerId, payload }); }
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
  if (!connected && !anyPeerConnecting()) {
    _started = false;
    _onMeshIdle?.();
  }
}
function labelForPeer(peerId) {
  try {
    const list = window.__lastPresence || [];
    const hit = list.find(p => p.clientId === peerId);
    return hit?.username ? hit.username : 'Remote';
  } catch { return 'Remote'; }
}
function computePolite(peerId, inboundOffer = false) {
  if (inboundOffer) return true; // callee = polite
  if (!_selfId) return false;
  return String(_selfId) > String(peerId); // deterministic
}
function pcIsClosed(pc) {
  return !pc || pc.signalingState === 'closed' || pc.connectionState === 'closed';
}

// Tiny debug helper
try {
  window.__webrtc_dbg = window.__webrtc_dbg || {};
  window.__webrtc_dbg.dump = () =>
    Array.from(pcByPeer.entries()).map(([peerId, pc]) => ({
      peerId,
      state: pc.connectionState,
      sig: pc.signalingState,
      mids: pc.getTransceivers().map(t => `${t.mid}:${t.receiver.track?.kind}:${t.direction}`)
    }));
} catch {}

// ────────────────────────────────────────────────────────────────────────────
// Defensive SDP sanitizer: reject extra m-lines beyond the first audio+video
// (keeps order; avoids remote adding new sections mid-call)
// ────────────────────────────────────────────────────────────────────────────
function rejectExtraMediaSections(sdp) {
  const lines = sdp.split(/\r?\n/);
  let audioCount = 0, videoCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('m=audio')) {
      audioCount++;
      if (audioCount > 1) {
        // reject this m-line
        lines[i] = l.replace(/^m=audio\s+\d+\s/, 'm=audio 0 ');
        // Also force inactive if direction appears
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('m=')) break;
          if (lines[j].startsWith('a=sendrecv')) lines[j] = 'a=inactive';
          if (lines[j].startsWith('a=sendonly')) lines[j] = 'a=inactive';
          if (lines[j].startsWith('a=recvonly')) lines[j] = 'a=inactive';
        }
      }
    } else if (l.startsWith('m=video')) {
      videoCount++;
      if (videoCount > 1) {
        lines[i] = l.replace(/^m=video\s+\d+\s/, 'm=video 0 ');
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('m=')) break;
          if (lines[j].startsWith('a=sendrecv')) lines[j] = 'a=inactive';
          if (lines[j].startsWith('a=sendonly')) lines[j] = 'a=inactive';
          if (lines[j].startsWith('a=recvonly')) lines[j] = 'a=inactive';
        }
      }
    }
  }
  return lines.join('\r\n');
}

async function drainPendingICE(peerId, extra = []) {
  const pc = pcByPeer.get(peerId);
  if (!pc || !pc.remoteDescription) return;
  const bucket = ensurePending(peerId);
  const all = [...extra, ...bucket];
  if (all.length === 0) return;
  for (const cand of all) {
    try { await pc.addIceCandidate(cand); } catch {}
  }
  bucket.length = 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Local tracks (created lazily; no gUM needed for baseline m-lines)
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
// Base transceivers per peer (stabilize m-line and wire senders)
// NOTE: make this SYNC; no gUM here. Attach tracks later via replaceTrack.
// ────────────────────────────────────────────────────────────────────────────
function ensureBaseTransceivers(peerId, pc) {
  if (sendersByPeer.has(peerId)) return sendersByPeer.get(peerId);

  // Deterministic order: AUDIO first, then VIDEO
  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });

  const bundle = {
    audioTx,
    videoTx,
    audioSender: audioTx.sender,
    videoSender: videoTx.sender
  };
  sendersByPeer.set(peerId, bundle);
  return bundle;
}

// ────────────────────────────────────────────────────────────────────────────
// Peer factory
// ────────────────────────────────────────────────────────────────────────────
function ensurePeerConnection(peerId) {
  if (pcByPeer.has(peerId)) return pcByPeer.get(peerId);

  const pc = new RTCPeerConnection({
    bundlePolicy: 'max-bundle',
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // Precreate baseline transceivers immediately to lock m-line order.
  ensureBaseTransceivers(peerId, pc);

  // --- ICE
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { candidate: e.candidate.toJSON() });
    }
  };

  // --- Track → combine into a per-peer stream and hand to UI
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
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
      try { UI_removeVideoTile?.(peerId); } catch {}
    }
    recomputeStartActive();
  };

  // --- Negotiationneeded (guarded by makingOffer)
  pc.onnegotiationneeded = async () => {
    try {
      if (pc.signalingState !== 'stable') return;
      if (makingOfferByPeer.get(peerId)) return;
      makingOfferByPeer.set(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    } catch (e) {
      console.warn('[mesh] negotiationneeded failed:', e);
    } finally {
      makingOfferByPeer.set(peerId, false);
    }
  };

  pcByPeer.set(peerId, pc);
  return pc;
}

function closePeer(peerId) {
  const pc = pcByPeer.get(peerId);
  const snd = sendersByPeer.get(peerId);

  // Detach tracks from senders BEFORE closing the PC, and only if not already closed
  if (!pcIsClosed(pc)) {
    try { snd?.audioSender?.replaceTrack?.(null); } catch {}
    try { snd?.videoSender?.replaceTrack?.(null); } catch {}
  }

  // Stop local per-sender tracks (safe)
  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { pc?.close?.(); } catch {}

  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  makingOfferByPeer.delete(peerId);
  sendersByPeer.delete(peerId);

  try { UI_removeVideoTile?.(peerId); } catch {}
  recomputeStartActive();
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
  const snd = ensureBaseTransceivers(peerId, pc);

  // If camera/mic are already active, attach tracks now (no new m-lines)
  try {
    if (!_localAudioTrack) _localAudioTrack = (await ensureLocalAudioTrack()) || null;
    await snd.audioSender.replaceTrack(_localAudioTrack || null);
  } catch {}
  try { await snd.videoSender.replaceTrack(_localVideoTrack || null); } catch {}

  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  if (inboundOffer) {
    // Callee path
    const patchedOffer = {
      type: 'offer',
      sdp: rejectExtraMediaSections(inboundOffer.sdp || '')
    };
    await pc.setRemoteDescription(patchedOffer);
    if (makingOfferByPeer.get(peerId)) {
      // Rare but be safe
      await pc.setLocalDescription({ type: 'rollback' });
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    await drainPendingICE(peerId, pendingCandidates);
  } else {
    // Caller path
    if (!pc.localDescription && pc.signalingState === 'stable' && !makingOfferByPeer.get(peerId)) {
      makingOfferByPeer.set(peerId, true);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendTo(peerId, pc.localDescription);
      } finally {
        makingOfferByPeer.set(peerId, false);
      }
    }
  }
}

// -- Handle signal
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  ensureBaseTransceivers(peerId, pc);

  // If we first see an offer before we computed politeness, mark as polite
  if (payload.type === 'offer' && !politeByPeer.has(peerId)) politeByPeer.set(peerId, true);
  const polite = !!politeByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      const collision = pc.signalingState !== 'stable' || makingOfferByPeer.get(peerId);
      const ignore = !polite && collision;
      if (ignore) return;
      if (collision) {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      const patchedOffer = { type: 'offer', sdp: rejectExtraMediaSections(payload.sdp || '') };
      await pc.setRemoteDescription(patchedOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);
      await drainPendingICE(peerId);
    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(payload); // answers should already match our 2-section offer
      await drainPendingICE(peerId);
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
      ensureBaseTransceivers(peerId, pc);
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
  } catch { return false; }
}
