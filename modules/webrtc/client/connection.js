// modules/webrtc/client/connection.js
// Clean 1:many mesh.
// - One RTCPeerConnection per peer
// - One audio/video transceiver per peer
// - Per-peer audio attach (no shared <audio> element)
// - Perfect negotiation-ish with polite + makingOffer
// - Camera toggle fans out to all peers

import { UI_addVideoTile, UI_removeVideoTile, UI_updateVideoLabel, UI_attachAudio } from './ui.js';

// ---------- Mesh state ----------
const peers = new Map(); // peerId -> { pc, audioTx, videoTx, audioSender, videoSender }
const pendingICEByPeer = new Map(); // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map(); // peerId -> boolean
const makingOfferByPeer = new Map(); // peerId -> boolean

let localStream = null;          // holds local mic + (optional) camera track(s)
let localMicTrack = null;
let localVideoTrack = null;

let _cameraOn = false;
let _sendSignal = null;
let _started = false;

// ---------- helpers ----------
function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}
function sendTo(peerId, payload) {
  _sendSignal?.({ to: peerId, payload });
}
function getPeerState(peerId) {
  return peers.get(peerId) || null;
}
function setPeerState(peerId, state) {
  peers.set(peerId, state);
  return state;
}

// ---------- local media ----------
async function ensureLocalMic() {
  if (localMicTrack && localMicTrack.readyState === 'live') return localMicTrack;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream = localStream || new MediaStream();
  // Drop old mic tracks from the stream
  try { localStream.getAudioTracks().forEach(t => localStream.removeTrack(t)); } catch {}
  localMicTrack = mic.getAudioTracks()[0] || null;
  if (localMicTrack) localStream.addTrack(localMicTrack);
  return localMicTrack;
}

async function ensureLocalVideo() {
  if (localVideoTrack && localVideoTrack.readyState === 'live') return localVideoTrack;
  const cam = await navigator.mediaDevices.getUserMedia({ video: true });
  localStream = localStream || new MediaStream();
  // Drop old video tracks from the stream
  try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
  localVideoTrack = cam.getVideoTracks()[0] || null;
  if (localVideoTrack) localStream.addTrack(localVideoTrack);
  return localVideoTrack;
}

// ---------- per-peer PC factory ----------
function ensurePeerConnection(peerId) {
  const existing = getPeerState(peerId);
  if (existing?.pc && existing.pc.signalingState !== 'closed') return existing.pc;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  makingOfferByPeer.set(peerId, false);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { type: 'candidate', candidate: e.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[mesh]', peerId, 'state:', pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      try { UI_removeVideoTile(peerId); } catch {}
    }
  };

  pc.ontrack = (e) => {
    // Maintain a single MediaStream per remote peerId
    let stream = new MediaStream();
    // Collect all tracks for this peer into the same stream
    // (Note: multiple ontrack events may fire for same stream)
    e.streams?.[0] ? (stream = e.streams[0]) : stream.addTrack(e.track);

    if (e.track.kind === 'audio') {
      // Attach audio into a hidden <audio> inside the peer's tile
      UI_attachAudio(peerId, stream);
    }
    if (e.track.kind === 'video') {
      // Label with username if presence knows it
      const label = findDisplayName(peerId) || 'Remote';
      UI_addVideoTile(peerId, stream, { label, muted: true });
    }
  };

  pc.onnegotiationneeded = async () => {
    // Offerer path
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

  // Create the per-peer transceivers up front
  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });

  const state = setPeerState(peerId, {
    pc,
    audioTx,
    videoTx,
    audioSender: audioTx.sender,
    videoSender: videoTx.sender
  });

  // If we already have local tracks, attach them now
  if (localMicTrack) state.audioSender.replaceTrack(localMicTrack).catch(() => {});
  if (localVideoTrack) state.videoSender.replaceTrack(localVideoTrack).catch(() => {});

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
export function RTC_setSignalSender(fn) {
  _sendSignal = typeof fn === 'function' ? fn : null;
}

export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  // polite means: if glare happens, we accept the remote offer (the callee)
  politeByPeer.set(peerId, !!inboundOffer);

  // Attach local tracks if present (important for late-joiners)
  const st = getPeerState(peerId);
  if (localMicTrack) st.audioSender.replaceTrack(localMicTrack).catch(() => {});
  if (localVideoTrack) st.videoSender.replaceTrack(localVideoTrack).catch(() => {});

  if (inboundOffer) {
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    // Flush candidates that arrived early
    const bucket = ensurePending(peerId);
    for (const c of [...pendingCandidates, ...bucket]) {
      try { await pc.addIceCandidate(c); } catch {}
    }
    bucket.length = 0;
  } else {
    // Outbound dial: onnegotiationneeded will send the offer
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
      const ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) {
        console.log('[mesh] glare: ignoring remote offer (impolite)', peerId);
        return;
      }
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
  try {
    localStream?.getTracks?.().forEach(t => t.stop());
  } catch {}
  localStream = null;
  localMicTrack = null;
  localVideoTrack = null;
  _cameraOn = false;
  _started = false;
}

// Mic toggle: enable/disable the local mic track; attach to all peers
export async function RTC_setMicEnabled(enabled) {
  if (!localMicTrack && enabled) {
    await ensureLocalMic();
    // attach to all peers
    for (const st of peers.values()) {
      try { await st.audioSender.replaceTrack(localMicTrack); } catch {}
    }
  }
  if (localMicTrack) {
    localMicTrack.enabled = !!enabled;
    return localMicTrack.enabled;
  }
  return false;
}

// Camera toggle across all peers
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && _cameraOn) {
    // detach from all peers
    for (const st of peers.values()) {
      try { await st.videoSender.replaceTrack(null); } catch {}
    }
    try { localVideoTrack?.stop?.(); } catch {}
    localVideoTrack = null;
    try { UI_removeVideoTile('local'); } catch {}
    _cameraOn = false;
    return false;
  }

  if (enabled && !_cameraOn) {
    await ensureLocalVideo();
    // attach to all peers
    for (const st of peers.values()) {
      try { await st.videoSender.replaceTrack(localVideoTrack); } catch {}
    }
    // show local preview
    UI_addVideoTile('local', localStream, { label: 'You', muted: true });
    _cameraOn = true;
    return true;
  }

  return _cameraOn;
}

// ---------- utils ----------
function findDisplayName(peerId) {
  try {
    const list = window.__lastPresence || [];
    const p = list.find(x => x.clientId === peerId);
    return p?.username || null;
  } catch { return null; }
}
