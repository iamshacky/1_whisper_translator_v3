// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// and lazy camera toggle. One RTCPeerConnection per peerId.

import { UI_addVideoTile, UI_removeVideoTile, UI_updateVideoLabel } from './ui.js';

// 🔗 Mesh state
const pcByPeer = new Map();              // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();    // peerId -> MediaStream
const pendingICEByPeer = new Map();      // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();          // peerId -> boolean

// Per-peer senders/transceivers (so every peer gets media)
const audioSenderByPeer = new Map();     // peerId -> RTCRtpSender
const videoSenderByPeer = new Map();     // peerId -> RTCRtpSender
const videoTxByPeer     = new Map();     // peerId -> RTCRtpTransceiver

// Local media
let localStream = null;
let _micTrack = null;                    // shared single mic track for all peers
let _localVideoTrack = null;             // shared camera track for all peers
let _cameraOn = false;

let _sendSignal = null;
let _started = false;

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

function lookupName(peerId) {
  try {
    const list = window.__lastPresence || [];
    const p = list.find(x => x.clientId === peerId);
    return (p?.username || 'Remote').trim();
  } catch {
    return 'Remote';
  }
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
      UI_addVideoTile(peerId, stream, { label: lookupName(peerId), muted: true });
    }
  };

  // --- State
  pc.onconnectionstatechange = () => {
    console.log(`[mesh] ${peerId} state:`, pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      try { UI_removeVideoTile?.(peerId); } catch {}
    }
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

  // --- Baseline transceivers for THIS peer
  (async () => { await ensureBaseTransceiversForPeer(pc, peerId); })().catch(() => {});

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
  audioSenderByPeer.delete(peerId);
  videoSenderByPeer.delete(peerId);
  videoTxByPeer.delete(peerId);
  try { UI_removeVideoTile?.(peerId); } catch {}
}

// --------------------------------------------
// Public API
// --------------------------------------------
export function RTC_setSignalSender(fn) {
  _sendSignal = typeof fn === 'function' ? fn : null;
}

export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

// -- Start peer
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  politeByPeer.set(peerId, !!inboundOffer);

  // Ensure this peer has transceivers bound to our shared tracks
  await ensureBaseTransceiversForPeer(pc, peerId);

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

  // 🔧 Defensive unwrapping in case a wrapper slipped through (e.g. {to, payload})
  if (payload && typeof payload === 'object' && 'payload' in payload && payload.payload) {
    payload = payload.payload;
  }

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
  _micTrack = null;
  audioSenderByPeer.clear();
  videoSenderByPeer.clear();
  videoTxByPeer.clear();
  _started = false;
}

// -- Camera toggle (apply to all peers)
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    // Remove track from all video senders
    for (const sender of videoSenderByPeer.values()) {
      try { await sender.replaceTrack(null); } catch {}
    }
    try { _localVideoTrack?.stop?.(); } catch {}
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

    // Apply to all existing peers
    for (const [peerId, sender] of videoSenderByPeer.entries()) {
      try { await sender.replaceTrack(track); } catch {}
      UI_updateVideoLabel?.(peerId, lookupName(peerId));
    }

    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }

  return _cameraOn;
}

// -- Mic toggle (flip enabled on the shared mic track)
export function RTC_setMicEnabled(enabled) {
  try {
    if (_micTrack) _micTrack.enabled = !!enabled;
    const locals = localStream?.getAudioTracks?.() || [];
    locals.forEach(a => a.enabled = !!enabled);
    return _micTrack ? _micTrack.enabled : (locals[0]?.enabled || false);
  } catch {
    return false;
  }
}

// --------------------------------------------
// Base transceivers (PER PEER)
// --------------------------------------------
async function ensureBaseTransceiversForPeer(pc, peerId) {
  // Ensure we have a single mic track (shared)
  if (!_micTrack) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream = localStream || new MediaStream();
      const [track] = mic.getAudioTracks();
      if (track) {
        _micTrack = track;
        localStream.addTrack(track);
      }
    } catch (e) {
      console.warn('[mesh] could not getUserMedia(audio):', e);
    }
  }

  // Audio transceiver for THIS peer
  if (!audioSenderByPeer.has(peerId)) {
    const txA = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const aSender = txA.sender;
    audioSenderByPeer.set(peerId, aSender);
    try { await aSender.replaceTrack(_micTrack || null); } catch {}
  }

  // Video transceiver for THIS peer (always present to keep m-line order)
  if (!videoTxByPeer.has(peerId)) {
    const txV = pc.addTransceiver('video', { direction: 'sendrecv' });
    videoTxByPeer.set(peerId, txV);
    videoSenderByPeer.set(peerId, txV.sender);
    try { await txV.sender.replaceTrack(_localVideoTrack || null); } catch {}
  }
}
