// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// per-peer transceivers/senders (no single-PC assumptions), auto-rejoin hooks,
// and camera/mic toggles that fan out to ALL peers.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// 🔗 Mesh state
const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean

// 🔊 NEW: per-peer senders (no more single global sender!)
const audioSenderByPeer = new Map();        // peerId -> RTCRtpSender
const videoSenderByPeer = new Map();        // peerId -> RTCRtpSender

let localStream = null;
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
    _started = false; // future offers show Accept; Join will dial again
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
  if (inboundOffer) return true;            // callee is polite
  if (!_selfId) return false;
  return String(_selfId) > String(peerId);  // tie-break
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
      // 🟩 DEBUG: negotiationneeded
      console.log(`🟩 [mesh] onnegotiationneeded → createOffer/send to ${peerId}`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    } catch (e) {
      console.warn('[mesh] negotiationneeded failed:', e);
    }
  };

  // --- Pre-add baseline transceivers for stable m-line order
  (async () => { await ensureBaseTransceiversForPeer(pc, peerId); })().catch(() => {});

  pcByPeer.set(peerId, pc);
  return pc;
}

function closePeer(peerId) {
  const pc = pcByPeer.get(peerId);

  // 🟡 DEBUG: closePeer
  console.log(`🟡 [mesh] closePeer(${peerId})`);

  // try to detach tracks without throwing if pc is closed
  try {
    const vSender = videoSenderByPeer.get(peerId);
    const aSender = audioSenderByPeer.get(peerId);
    try { vSender && vSender.replaceTrack && vSender.replaceTrack(null).catch?.(() => {}); } catch {}
    try { aSender && aSender.replaceTrack && aSender.replaceTrack(null).catch?.(() => {}); } catch {}
  } catch {}

  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { pc?.close?.(); } catch {}

  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  audioSenderByPeer.delete(peerId);
  videoSenderByPeer.delete(peerId);

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

    // If our camera was already on, make sure THIS peer gets our track now.
    if (_cameraOn && _localVideoTrack) {
      const vSender = videoSenderByPeer.get(peerId);
      try {
        await vSender?.replaceTrack?.(_localVideoTrack);
        console.log(`🟩 [mesh] applied local video track to late-joined peer ${peerId}`);
      } catch (e) {
        console.warn(`[mesh] failed to apply late video to ${peerId}:`, e);
      }
    }
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
      if (ignore) {
        console.log(`🟡 [mesh] glare: impolite peer ignoring remote offer from ${peerId}`);
        return;
      }
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

  audioSenderByPeer.clear();
  videoSenderByPeer.clear();

  _started = false;
  RTC_setStartActive(false);
}

// -- Camera toggle (fan out to ALL peers)
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    // Turn camera off for everyone
    const senders = Array.from(videoSenderByPeer.values());
    for (const s of senders) {
      try { await s?.replaceTrack?.(null); } catch {}
    }
    try { _localVideoTrack?.stop(); } catch {}
    _localVideoTrack = null;
    try { UI_removeVideoTile?.('local'); } catch {}
    _cameraOn = false;
    console.log('🟡 [mesh] camera OFF (track removed from all peers)');
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

    // Push to ALL peers that already have a video sender
    for (const [peerId, sender] of videoSenderByPeer.entries()) {
      try {
        await sender?.replaceTrack?.(track);
        console.log(`🟩 [mesh] applied local video to ${peerId}`);
      } catch (e) {
        console.warn(`[mesh] replaceTrack(video) failed for ${peerId}:`, e);
      }
    }

    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    console.log('🟩 [mesh] camera ON (track applied to all peers present)');
    return true;
  }

  return _cameraOn;
}

// -- Mic toggle
export function RTC_setMicEnabled(enabled) {
  try {
    const locals = localStream?.getAudioTracks?.() || [];
    locals.forEach(a => a.enabled = !!enabled);

    // Nothing else to do; each peer’s audio sender already points to the same track.
    // Return effective enabled state:
    if (locals[0]) return locals[0].enabled;

    // If we don't have a localStream yet, just say false.
    return false;
  } catch {
    return false;
  }
}

// --------------------------------------------
// Base transceivers (per peer)
// --------------------------------------------
async function ensureBaseTransceiversForPeer(pc, peerId) {
  // Always add BOTH transceivers per peer for stable m-line order.
  // AUDIO
  if (!audioSenderByPeer.has(peerId)) {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream = localStream || new MediaStream();
    const [aTrack] = mic.getAudioTracks();
    if (aTrack && !localStream.getAudioTracks().length) {
      localStream.addTrack(aTrack);
    }

    const aTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    audioSenderByPeer.set(peerId, aTx.sender);
    try { await aTx.sender.replaceTrack(localStream.getAudioTracks()[0] || null); } catch {}
    console.log(`🟩 [mesh] audio transceiver added for ${peerId}`);
  }

  // VIDEO
  if (!videoSenderByPeer.has(peerId)) {
    const vTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    videoSenderByPeer.set(peerId, vTx.sender);

    // If camera is already on, attach the current video track to this new peer now.
    if (_cameraOn && _localVideoTrack) {
      try {
        await vTx.sender.replaceTrack(_localVideoTrack);
        console.log(`🟩 [mesh] video transceiver added & track applied for ${peerId}`);
      } catch (e) {
        console.warn(`[mesh] failed to apply existing cam to ${peerId}:`, e);
      }
    } else {
      // else keep null; the transceiver reserves the m-line for future camera-on.
      console.log(`🟡 [mesh] video transceiver added for ${peerId} (no track yet)`);
    }
  }
}
