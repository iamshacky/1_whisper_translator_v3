// modules/webrtc/client/connection.js
// Mesh with stable m-line order, perfect negotiation, per-peer PCs, and replaceTrack-only toggles.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// ────────────────────────────────────────────────────────────────────────────
// Mesh state
// ────────────────────────────────────────────────────────────────────────────
const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean
const makingOfferByPeer = new Map();        // peerId -> boolean
const startedByPeer = new Map();            // peerId -> boolean (idempotent start)

// Per-peer local senders/transceivers (so every peer receives our mic/cam)
const sendersByPeer = new Map();            // peerId -> { audioTx, videoTx, audioSender, videoSender }

let localStream = null;                     // for local preview
let _localAudioTrack = null;
let _localVideoTrack = null;
let _cameraOn = false;

let _sendSignal = null;
let _started = false;
let _selfId = null;

let _onMeshIdle = null;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}
function sendTo(peerId, payload) { _sendSignal?.({ to: peerId, payload }); }
function anyPeerConnected() { return [...pcByPeer.values()].some(pc => pc.connectionState === 'connected'); }
function anyPeerConnecting() { return [...pcByPeer.values()].some(pc => ['connecting','new'].includes(pc.connectionState)); }
function recomputeStartActive() {
  const connected = anyPeerConnected();
  RTC_setStartActive(connected);
  if (!connected && !anyPeerConnecting()) { _started = false; _onMeshIdle?.(); }
}
function labelForPeer(peerId) {
  try { const hit = (window.__lastPresence||[]).find(p => p.clientId === peerId); return hit?.username || 'Remote'; }
  catch { return 'Remote'; }
}
function computePolite(peerId, inboundOffer = false) {
  if (inboundOffer) return true;
  if (!_selfId) return false;
  return String(_selfId) > String(peerId);
}
function pcIsClosed(pc){ return !pc || pc.signalingState === 'closed' || pc.connectionState === 'closed'; }

try {
  window.__webrtc_dbg = window.__webrtc_dbg || {};
  window.__webrtc_dbg.dump = () =>
    [...pcByPeer.entries()].map(([peerId, pc]) => ({
      peerId,
      state: pc.connectionState,
      sig: pc.signalingState,
      mids: pc.getTransceivers().map(t => `${t.mid}:${t.receiver.track?.kind}:${t.direction}`)
    }));
} catch {}

// ────────────────────────────────────────────────────────────────────────────
// Local media
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
  const cam = await navigator.mediaDevices.getUserMedia({ video: true });
  const [track] = cam.getVideoTracks();
  _localVideoTrack = track || null;

  if (_localVideoTrack) {
    if (!localStream) localStream = new MediaStream();
    localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(_localVideoTrack);
  }
  return _localVideoTrack;
}

// ────────────────────────────────────────────────────────────────────────────
// Transceivers (stabilize m-line order)
// ────────────────────────────────────────────────────────────────────────────
function ensureBaseTransceivers(peerId, pc) {
  if (sendersByPeer.has(peerId)) return sendersByPeer.get(peerId);
  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  const bundle = { audioTx, videoTx, audioSender: audioTx.sender, videoSender: videoTx.sender };
  sendersByPeer.set(peerId, bundle);
  return bundle;
}
async function drainPendingICE(peerId, extra = []) {
  const pc = pcByPeer.get(peerId);
  if (!pc || !pc.remoteDescription) return;
  const bucket = ensurePending(peerId);
  for (const cand of [...extra, ...bucket]) { try { await pc.addIceCandidate(cand); } catch {} }
  bucket.length = 0;
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

  // Precreate transceivers *before* any offer can be made
  ensureBaseTransceivers(peerId, pc);

  pc.onicecandidate = (e) => { if (e.candidate) sendTo(peerId, { candidate: e.candidate.toJSON() }); };

  pc.ontrack = (e) => {
    let stream = remoteStreamByPeer.get(peerId);
    if (!stream) { stream = new MediaStream(); remoteStreamByPeer.set(peerId, stream); }
    stream.addTrack(e.track);
    UI_addVideoTile(peerId, stream, { label: labelForPeer(peerId), muted: true });
  };

  pc.onconnectionstatechange = () => {
    console.log(`[mesh] ${peerId} state:`, pc.connectionState);
    if (['failed','closed','disconnected'].includes(pc.connectionState)) {
      try { UI_removeVideoTile?.(peerId); } catch {}
    }
    recomputeStartActive();
  };

  // Single authoritative offer path
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

  if (!pcIsClosed(pc)) {
    try { snd?.audioSender?.replaceTrack?.(null); } catch {}
    try { snd?.videoSender?.replaceTrack?.(null); } catch {}
  }
  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { pc?.close?.(); } catch {}

  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  makingOfferByPeer.delete(peerId);
  startedByPeer.delete(peerId);
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

// Start peer (idempotent). Does NOT create an offer; negotiationneeded will.
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  const snd = ensureBaseTransceivers(peerId, pc);
  if (!startedByPeer.get(peerId)) startedByPeer.set(peerId, true);
  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  // Attach tracks if already available (no new m-lines)
  try {
    if (!_localAudioTrack) _localAudioTrack = (await ensureLocalAudioTrack()) || null;
    await snd.audioSender.replaceTrack(_localAudioTrack || null);
  } catch {}
  try { await snd.videoSender.replaceTrack(_localVideoTrack || null); } catch {}

  if (inboundOffer) {
    // Callee path — accept remote offer and answer
    if (makingOfferByPeer.get(peerId)) {
      try { await pc.setLocalDescription({ type: 'rollback' }); } catch {}
      makingOfferByPeer.set(peerId, false);
    }
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);
    await drainPendingICE(peerId, pendingCandidates);
  }
  // Caller path: do nothing here; onnegotiationneeded will fire from transceivers/replaceTrack.
}

// Handle incoming SDP/ICE
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  ensureBaseTransceivers(peerId, pc);

  if (payload.type === 'offer' && !politeByPeer.has(peerId)) politeByPeer.set(peerId, true);
  const polite = !!politeByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      const collision = pc.signalingState !== 'stable' || makingOfferByPeer.get(peerId);
      const ignore = !polite && collision;
      if (ignore) return;
      if (collision) {
        try { await pc.setLocalDescription({ type: 'rollback' }); } catch {}
        makingOfferByPeer.set(peerId, false);
      }
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);
      await drainPendingICE(peerId);
    } else if (payload.type === 'answer') {
      // Only set if we actually have a local offer out.
      if (pc.localDescription?.type === 'offer') {
        await pc.setRemoteDescription(payload);
        await drainPendingICE(peerId);
      } else {
        // Stale/late answer; ignore.
        console.log('[mesh] ignoring answer with no matching local offer for', peerId);
      }
    } else if (payload.candidate) {
      try { await pc.addIceCandidate(payload); }
      catch { ensurePending(peerId).push(payload); }
    } else {
      console.log('[mesh] unknown signal payload from', peerId, payload);
    }
  } catch (e) {
    console.warn('[mesh] handleSignal error for', peerId, e);
  }
}

export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

export function RTC_teardownAll() {
  for (const id of [...pcByPeer.keys()]) closePeer(id);
  try { localStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  localStream = null;
  _localAudioTrack = null;
  _localVideoTrack = null;
  _cameraOn = false;
  _started = false;
  RTC_setStartActive(false);
}

// Camera toggle (replaceTrack on existing sender only)
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    try { _localVideoTrack?.stop(); } catch {}
    _localVideoTrack = null;
    for (const [, snd] of sendersByPeer) { try { await snd.videoSender?.replaceTrack(null); } catch {} }
    try { UI_removeVideoTile?.('local'); } catch {}
    _cameraOn = false;
    return false;
  }

  if (enabled && !_cameraOn) {
    const vTrack = await ensureLocalVideoTrack();
    if (!vTrack) return false;

    for (const [peerId, pc] of pcByPeer) {
      ensureBaseTransceivers(peerId, pc);
      const snd = sendersByPeer.get(peerId);
      try { await snd?.videoSender?.replaceTrack(vTrack); } catch {}
    }

    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }
  return _cameraOn;
}

// Mic toggle
export function RTC_setMicEnabled(enabled) {
  try {
    if (_localAudioTrack) _localAudioTrack.enabled = !!enabled;
    const locals = localStream?.getAudioTracks?.() || [];
    locals.forEach(a => a.enabled = !!enabled);
    return _localAudioTrack?.enabled ?? locals[0]?.enabled ?? false;
  } catch { return false; }
}
