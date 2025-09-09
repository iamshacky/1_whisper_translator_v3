// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// and no late transceiver adds. One RTCPeerConnection per peerId.
// This version fixes the “m-line order doesn’t match” errors and avoids
// replaceTrack() calls on closed peer connections.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mesh state
// ──────────────────────────────────────────────────────────────────────────────
const pcByPeer              = new Map(); // peerId -> RTCPeerConnection
const politeByPeer          = new Map(); // peerId -> boolean
const pendingICEByPeer      = new Map(); // peerId -> RTCIceCandidateInit[]
const remoteStreamByPeer    = new Map(); // peerId -> MediaStream

// Precreated, ordered transceivers/senders per peer (A/V always added in this order)
const audioSenderByPeer     = new Map(); // peerId -> RTCRtpSender
const videoSenderByPeer     = new Map(); // peerId -> RTCRtpSender

let _sendSignal   = null;
let _selfId       = null;
let _started      = false;

// Local media (single capture shared to all peers)
let localStream       = null;
let localMicTrack     = null;
let localVideoTrack   = null;
let _cameraOn         = false;

// Optional “mesh went idle” subscriber
let _onMeshIdle = null;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function ensureBucket(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}

function sendTo(peerId, payload) {
  _sendSignal?.({ to: peerId, payload });
}

function anyPeerConnected() {
  return Array.from(pcByPeer.values())
    .some(pc => pc.connectionState === 'connected');
}
function anyPeerConnecting() {
  return Array.from(pcByPeer.values())
    .some(pc => pc.connectionState === 'connecting' || pc.connectionState === 'new');
}

function recomputeStartActive() {
  const connected = anyPeerConnected();
  RTC_setStartActive(connected);

  if (!connected && !anyPeerConnecting()) {
    _started = false; // important for Accept-as-Join UX
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
  if (inboundOffer) return true; // callee acts polite on inbound offer
  if (!_selfId) return false;
  // Deterministic tie-break
  return String(_selfId) > String(peerId);
}

async function ensureLocalMic() {
  if (localMicTrack && localMicTrack.readyState === 'live') return localMicTrack;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  localMicTrack = mic.getAudioTracks()[0] || null;
  localStream = localStream || new MediaStream();
  if (localMicTrack) localStream.addTrack(localMicTrack);
  return localMicTrack;
}

// ──────────────────────────────────────────────────────────────────────────────
/**
 * Create (or return) a PC for peerId with A/V transceivers precreated
 * in stable, consistent order: audio first, video second (both sendrecv).
 * We never add new transceivers later; toggles only replaceTrack().
 */
// ──────────────────────────────────────────────────────────────────────────────
function ensurePeerConnection(peerId) {
  if (pcByPeer.has(peerId)) return pcByPeer.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // ── Events
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { candidate: e.candidate.toJSON() });
    }
  };

  pc.ontrack = (e) => {
    let stream = remoteStreamByPeer.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreamByPeer.set(peerId, stream);
    }
    stream.addTrack(e.track);

    if (e.track.kind === 'video') {
      UI_addVideoTile(peerId, stream, { label: labelForPeer(peerId), muted: true });
    } else if (e.track.kind === 'audio') {
      // Keep legacy global audio element hookup (existing UI); tiles already handle video.
      const audioEl = document.getElementById('rtc-remote-audio');
      if (audioEl && audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        audioEl.play?.().catch(() => {});
      }
    }
  };

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

  // Negotiation — simple initiator path; glare handled in RTC_handleSignal
  pc.onnegotiationneeded = async () => {
    // Avoid spurious offers while not started
    if (!_started) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    } catch (e) {
      console.warn('[mesh] negotiationneeded failed:', e);
    }
  };

  // ── Precreate transceivers in stable order: AUDIO then VIDEO
  // Audio
  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  audioSenderByPeer.set(peerId, audioTx.sender);

  // Video
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  videoSenderByPeer.set(peerId, videoTx.sender);

  // Attach current local tracks (if any)
  (async () => {
    try {
      // Mic
      if (!localMicTrack) await ensureLocalMic();
      await audioTx.sender.replaceTrack(localMicTrack || null);

      // Video
      await videoTx.sender.replaceTrack(localVideoTrack || null);
    } catch (e) {
      console.warn('[mesh] initial sender replaceTrack failed:', e);
    }
  })().catch(() => {});

  pcByPeer.set(peerId, pc);
  return pc;
}

function closePeer(peerId) {
  const pc = pcByPeer.get(peerId);

  // Clean UI
  try { UI_removeVideoTile?.(peerId); } catch {}

  // Clear sender refs first (no replaceTrack on a closing/closed PC)
  audioSenderByPeer.delete(peerId);
  videoSenderByPeer.delete(peerId);

  // Close PC
  try { pc?.close?.(); } catch {}
  pcByPeer.delete(peerId);

  // Clear ancillary maps
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);

  recomputeStartActive();
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────
export function RTC_setSignalSender(fn) {
  _sendSignal = typeof fn === 'function' ? fn : null;
}
export function RTC_setSelfId(id) { _selfId = id || null; }
export function RTC_onMeshIdle(cb) { _onMeshIdle = typeof cb === 'function' ? cb : null; }

export function RTC_isStarted()   { return _started; }
export function RTC_isCameraOn()  { return _cameraOn; }

// Start/Join peer
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  if (inboundOffer) {
    // Callee path
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    // Drain any early candidates
    const bucket = ensureBucket(peerId);
    for (const cand of [...pendingCandidates, ...bucket]) {
      try { await pc.addIceCandidate(cand); } catch {}
    }
    bucket.length = 0;
  } else {
    // Caller path
    if (pc.signalingState === 'stable') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    }
  }
}

// Handle inbound SDP/ICE (perfect negotiation)
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  const polite = !!politeByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      const collision = pc.signalingState !== 'stable';
      const ignore = !polite && collision;
      if (ignore) return; // impolite peer ignores the glare

      if (collision) {
        // polite peer rolls back local changes then applies remote
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);

    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(payload);

    } else if (payload.candidate) {
      try {
        await pc.addIceCandidate(payload);
      } catch {
        ensureBucket(peerId).push(payload);
      }

    } else {
      console.log('[mesh] unknown signal payload from', peerId, payload);
    }
  } catch (e) {
    console.warn('[mesh] handleSignal error for', peerId, e);
  }
}

// Hang up a single peer
export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

// Full teardown
export function RTC_teardownAll() {
  for (const id of Array.from(pcByPeer.keys())) closePeer(id);

  // Stop local tracks and clear
  try { localMicTrack?.stop?.(); } catch {}
  try { localVideoTrack?.stop?.(); } catch {}
  localMicTrack   = null;
  localVideoTrack = null;
  localStream     = null;

  _cameraOn = false;
  _started  = false;
  RTC_setStartActive(false);
}

// ──────────────────────────────────────────────────────────────────────────────
// Camera toggle (no new transceivers; only replaceTrack across all peers)
// ──────────────────────────────────────────────────────────────────────────────
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    try {
      // Remove local video track from all peers
      for (const [peerId, sender] of videoSenderByPeer.entries()) {
        try {
          if (pcByPeer.get(peerId)?.connectionState !== 'closed') {
            await sender.replaceTrack(null);
          }
        } catch {}
      }
      // Stop local track
      try { localVideoTrack?.stop?.(); } catch {}
      localVideoTrack = null;
      try { UI_removeVideoTile?.('local'); } catch {}
    } finally {
      _cameraOn = false;
    }
    return false;
  }

  if (enabled && !_cameraOn) {
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = camStream.getVideoTracks()[0];
    if (!track) return false;

    localVideoTrack = track;
    // keep a local composite
    localStream = localStream || new MediaStream();
    try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
    localStream.addTrack(track);

    // Push the same track to all peers’ precreated video senders
    for (const [peerId, sender] of videoSenderByPeer.entries()) {
      try {
        if (pcByPeer.get(peerId)?.connectionState !== 'closed') {
          await sender.replaceTrack(track);
        }
      } catch (e) {
        console.warn('[mesh] video replaceTrack failed for', peerId, e);
      }
    }

    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }

  return _cameraOn;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mic toggle — keep one capture; toggle enabled state
// ──────────────────────────────────────────────────────────────────────────────
export function RTC_setMicEnabled(enabled) {
  try {
    if (localMicTrack) {
      localMicTrack.enabled = !!enabled;
      return localMicTrack.enabled;
    }
    return false;
  } catch {
    return false;
  }
}
