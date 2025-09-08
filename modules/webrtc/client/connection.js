// modules/webrtc/client/connection.js
// Per-peer PC + per-peer senders; safe negotiation; camera/mic fan-out.

import { UI_addVideoTile, UI_removeVideoTile, UI_updateVideoLabel, UI_attachAudio } from './ui.js';

const peers = new Map(); // peerId -> { pc, audioTx, videoTx, audioSender, videoSender }
const pendingICEByPeer = new Map();
const politeByPeer = new Map();
const makingOfferByPeer = new Map();

let localStream = null;
let localMicTrack = null;
let localVideoTrack = null;

let _cameraOn = false;
let _sendSignal = null;
let _started = false;

function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}
function sendTo(peerId, payload) { _sendSignal?.({ to: peerId, payload }); }
function getPeerState(peerId) { return peers.get(peerId) || null; }
function setPeerState(peerId, st) { peers.set(peerId, st); return st; }

async function ensureLocalMic() {
  if (localMicTrack && localMicTrack.readyState === 'live') return localMicTrack;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream = localStream || new MediaStream();
  try { localStream.getAudioTracks().forEach(t => localStream.removeTrack(t)); } catch {}
  localMicTrack = mic.getAudioTracks()[0] || null;
  if (localMicTrack) localStream.addTrack(localMicTrack);
  return localMicTrack;
}
async function ensureLocalVideo() {
  if (localVideoTrack && localVideoTrack.readyState === 'live') return localVideoTrack;
  const cam = await navigator.mediaDevices.getUserMedia({ video: true });
  localStream = localStream || new MediaStream();
  try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
  localVideoTrack = cam.getVideoTracks()[0] || null;
  if (localVideoTrack) localStream.addTrack(localVideoTrack);
  return localVideoTrack;
}

function ensurePeerConnection(peerId) {
  const exist = getPeerState(peerId);
  if (exist?.pc && exist.pc.signalingState !== 'closed') return exist.pc;

  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  makingOfferByPeer.set(peerId, false);

  pc.onicecandidate = (e) => {
    if (e.candidate) sendTo(peerId, { type: 'candidate', candidate: e.candidate.toJSON() });
  };

  pc.onconnectionstatechange = () => {
    console.log('[mesh]', peerId, 'state:', pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      try { UI_removeVideoTile(peerId); } catch {}
    }
  };

  pc.ontrack = (e) => {
    let stream = e.streams?.[0] || new MediaStream([e.track]);
    if (e.track.kind === 'audio') UI_attachAudio(peerId, stream);
    if (e.track.kind === 'video') {
      UI_addVideoTile(peerId, stream, { label: findDisplayName(peerId) || 'Remote', muted: true });
    }
  };

  pc.onnegotiationneeded = async () => {
    // Guard against re-offer while remote offer is pending
    if (pc.signalingState !== 'stable') { return; }
    try {
      makingOfferByPeer.set(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    } catch (err) {
      console.warn('[mesh] negotiationneeded failed:', err);
    } finally {
      makingOfferByPeer.set(peerId, false);
    }
  };

  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });

  const st = setPeerState(peerId, {
    pc, audioTx, videoTx, audioSender: audioTx.sender, videoSender: videoTx.sender
  });

  if (localMicTrack) st.audioSender.replaceTrack(localMicTrack).catch(() => {});
  if (localVideoTrack) st.videoSender.replaceTrack(localVideoTrack).catch(() => {});

  return pc;
}

function closePeer(peerId) {
  const st = getPeerState(peerId);
  if (!st) return;
  try { st.pc.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { st.pc.close?.(); } catch {}
  peers.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  makingOfferByPeer.delete(peerId);
  try { UI_removeVideoTile(peerId); } catch {}
}

// ---------- Public API ----------
export function RTC_setSignalSender(fn) { _sendSignal = (typeof fn === 'function') ? fn : null; }
export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  // De-dupe: if we already have a live pc, skip
  const existing = getPeerState(peerId)?.pc;
  if (existing && existing.signalingState !== 'closed') {
    return; // already dialing/connected
  }

  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  politeByPeer.set(peerId, !!inboundOffer);

  const st = getPeerState(peerId);
  if (localMicTrack) st.audioSender.replaceTrack(localMicTrack).catch(() => {});
  if (localVideoTrack) st.videoSender.replaceTrack(localVideoTrack).catch(() => {});

  if (inboundOffer) {
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    const bucket = ensurePending(peerId);
    for (const c of [...pendingCandidates, ...bucket]) { try { await pc.addIceCandidate(c); } catch {} }
    bucket.length = 0;
  } else {
    if (!pc.localDescription && pc.signalingState === 'stable') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    }
  }
}

export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  const polite = !!politeByPeer.get(peerId);
  const makingOffer = !!makingOfferByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      const offerCollision = (makingOffer || pc.signalingState !== 'stable');
      const ignore = !polite && offerCollision;
      if (ignore) return;
      if (offerCollision) {
        await Promise.allSettled([pc.setLocalDescription({ type: 'rollback' })]);
      }
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);
    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(payload);
    } else if (payload.type === 'candidate' || payload.candidate) {
      const cand = payload.candidate || payload;
      try { await pc.addIceCandidate(cand); }
      catch { ensurePending(peerId).push(cand); }
    } else {
      console.log('[mesh] unknown signal payload shape from', peerId, payload);
    }
  } catch (e) {
    console.warn('[mesh] handleSignal error for', peerId, e);
  }
}

export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

export function RTC_teardownAll() {
  for (const id of Array.from(peers.keys())) closePeer(id);
  try { localStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  localStream = null;
  localMicTrack = null;
  localVideoTrack = null;
  _cameraOn = false;
  _started = false;
}

export async function RTC_setMicEnabled(enabled) {
  if (!localMicTrack && enabled) {
    await ensureLocalMic();
    for (const st of peers.values()) { try { await st.audioSender.replaceTrack(localMicTrack); } catch {} }
  }
  if (localMicTrack) {
    localMicTrack.enabled = !!enabled;
    return localMicTrack.enabled;
  }
  return false;
}

export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    for (const st of peers.values()) { try { await st.videoSender.replaceTrack(null); } catch {} }
    try { localVideoTrack?.stop?.(); } catch {}
    localVideoTrack = null;
    try { UI_removeVideoTile('local'); } catch {}
    _cameraOn = false;
    return false;
  }
  if (enabled && !_cameraOn) {
    await ensureLocalVideo();
    for (const st of peers.values()) { try { await st.videoSender.replaceTrack(localVideoTrack); } catch {} }
    UI_addVideoTile('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }
  return _cameraOn;
}

function findDisplayName(peerId) {
  try {
    const list = window.__lastPresence || [];
    const p = list.find(x => x.clientId === peerId);
    return p?.username || null;
  } catch { return null; }
}
