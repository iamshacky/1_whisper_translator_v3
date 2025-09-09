// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// per-peer baseline transceivers, and guarded negotiation.
// Includes bright log beacons 🟩/🟡 to help you grep in console quickly.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mesh state
// ─────────────────────────────────────────────────────────────────────────────
const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean

const baseReadyByPeer = new Map();          // 🟨 peerId -> Promise<void> (baseline transceivers ready)
const makingOfferByPeer = new Map();        // 🟨 peerId -> boolean (concurrent-offer guard)
const videoSenderByPeer = new Map();        // 🟨 peerId -> RTCRtpSender (video)

// Local media & flags
let localMicTrack = null;
let localVideoTrack = null;
let localStream = null;
let cameraOn = false;

// Signaling plumbing
let sendSignalFn = null;
let started = false;
let selfId = null;

// External hooks
let onMeshIdleCb = null;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}

function sendTo(peerId, payload) {
  sendSignalFn?.({ to: peerId, payload });
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

  if (!connected && !anyPeerConnecting()) {
    started = false;
    onMeshIdleCb?.();
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
  if (!selfId) return false;
  // Deterministic tie-break: the lexicographically larger id is polite
  return String(selfId) > String(peerId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline transceivers (per peer)
// ─────────────────────────────────────────────────────────────────────────────
async function ensureMicTrack() {
  if (localMicTrack) return localMicTrack;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  localMicTrack = mic.getAudioTracks()[0] || null;

  if (!localStream) localStream = new MediaStream();
  if (localMicTrack) {
    try {
      localStream.addTrack(localMicTrack);
    } catch {}
  }
  return localMicTrack;
}

async function ensureBaseTransceiversForPeer(pc, peerId) {
  // Audio first (locks m-line 0)
  const micTrack = await ensureMicTrack();
  const aTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  await aTx.sender.replaceTrack(micTrack || null);
  console.log(`🟩 [mesh] audio transceiver added for ${peerId}`);

  // Video next (locks m-line 1); track may be missing until user starts camera
  const vTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  videoSenderByPeer.set(peerId, vTx.sender);

  if (cameraOn && localVideoTrack) {
    await vTx.sender.replaceTrack(localVideoTrack);
    console.log(`🟩 [mesh] video transceiver added for ${peerId} (track applied)`);
  } else {
    console.log(`🟡 [mesh] video transceiver added for ${peerId} (no track yet)`);
  }
}

// Baseline readiness wrapper (await before any SDP work)
async function ensurePeerReady(peerId) {
  let ready = baseReadyByPeer.get(peerId);
  if (!ready) {
    const pc = ensurePeerConnection(peerId);
    ready = ensureBaseTransceiversForPeer(pc, peerId);
    baseReadyByPeer.set(peerId, ready);
  }
  await ready;
}

// ─────────────────────────────────────────────────────────────────────────────
// Peer factory & teardown
// ─────────────────────────────────────────────────────────────────────────────
function ensurePeerConnection(peerId) {
  if (pcByPeer.has(peerId)) return pcByPeer.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // ICE
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendTo(peerId, { candidate: e.candidate.toJSON() });
    }
  };

  // Tracks
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

  // Connection state
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

  // Negotiationneeded — guarded & baseline-aware
  pc.onnegotiationneeded = async () => {
    try {
      await ensurePeerReady(peerId); // 🟨 stabilize m-lines first

      // 🔶 Only create an offer when fully stable to avoid m-line churn
      if (pc.signalingState !== 'stable') {
        console.log(`🟡 [mesh] onnegotiationneeded ignored (state=${pc.signalingState}) for ${peerId}`);
        return;
      }

      if (makingOfferByPeer.get(peerId)) {
        console.log(`🟡 [mesh] onnegotiationneeded re-entrancy ignored for ${peerId}`);
        return;
      }

      makingOfferByPeer.set(peerId, true);
      console.log(`🟩 [mesh] onnegotiationneeded → createOffer/send to ${peerId}`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTo(peerId, pc.localDescription);
    } catch (e) {
      console.warn('[mesh] negotiationneeded failed:', e);
    } finally {
      makingOfferByPeer.set(peerId, false);
    }
  };

  // Prepare baseline readiness PROMISE (awaited elsewhere)
  if (!baseReadyByPeer.has(peerId)) {
    baseReadyByPeer.set(peerId, ensureBaseTransceiversForPeer(pc, peerId));
  }

  pcByPeer.set(peerId, pc);
  return pc;
}

function closePeer(peerId) {
  console.log(`🟡 [mesh] closePeer(${peerId})`);
  makingOfferByPeer.delete(peerId);
  baseReadyByPeer.delete(peerId);

  const pc = pcByPeer.get(peerId);
  try { pc?.getSenders?.().forEach(s => s.track && s.track.stop?.()); } catch {}
  try { pc?.close?.(); } catch {}
  pcByPeer.delete(peerId);
  remoteStreamByPeer.delete(peerId);
  pendingICEByPeer.delete(peerId);
  politeByPeer.delete(peerId);
  videoSenderByPeer.delete(peerId);
  try { UI_removeVideoTile?.(peerId); } catch {}
  recomputeStartActive();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
export function RTC_setSignalSender(fn) {
  sendSignalFn = typeof fn === 'function' ? fn : null;
}

export function RTC_setSelfId(id) {
  selfId = id || null;
}

export function RTC_onMeshIdle(cb) {
  onMeshIdleCb = typeof cb === 'function' ? cb : null;
}

export function RTC_isStarted() { return started; }
export function RTC_isCameraOn() { return cameraOn; }

// Start (or accept) peer
export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  started = true;

  const pc = ensurePeerConnection(peerId);
  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  // 🟨 ensure baseline BEFORE touching SDP
  await ensurePeerReady(peerId);

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

    // If camera already on, attach our local video to this late-joined peer
    if (cameraOn && localVideoTrack) {
      const vSender = videoSenderByPeer.get(peerId);
      try {
        await vSender?.replaceTrack?.(localVideoTrack);
        console.log(`🟩 [mesh] applied local video to ${peerId}`);
      } catch (e) {
        console.warn(`[mesh] failed to apply late video to ${peerId}:`, e);
      }
    }
    } else {
      // 🙌 Outbound: do nothing here.
      // Adding baseline transceivers has already triggered onnegotiationneeded().
    }
}

// Incoming signaling
export async function RTC_handleSignal({ from, payload }) {
  if (!payload) return;
  const peerId = from;
  const pc = ensurePeerConnection(peerId);
  const polite = !!politeByPeer.get(peerId);

  try {
    if (payload.type === 'offer') {
      await ensurePeerReady(peerId); // 🟨 make sure transceivers exist

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
      await ensurePeerReady(peerId);
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

// Hang up a single peer
export function RTC_hangUpPeer(peerId) { closePeer(peerId); }

// Teardown everything
export function RTC_teardownAll() {
  for (const id of Array.from(pcByPeer.keys())) closePeer(id);
  try { localStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  localStream = null;
  cameraOn = false;
  localVideoTrack = null;
  started = false;
  RTC_setStartActive(false);
}

// Camera toggle (fan out local video track to all peers)
export async function RTC_setCameraEnabled(enabled) {
  if (!enabled && cameraOn) {
    // Stop & detach
    try {
      for (const [, sender] of videoSenderByPeer) {
        try { await sender?.replaceTrack?.(null); } catch {}
      }
      localVideoTrack?.stop?.();
    } catch {}
    localVideoTrack = null;
    try { UI_removeVideoTile?.('local'); } catch {}
    cameraOn = false;
    return false;
  }

  if (enabled && !cameraOn) {
    // Acquire camera
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = camStream.getVideoTracks();
    if (!track) return false;

    localVideoTrack = track;

    // Ensure local preview stream
    if (!localStream) localStream = new MediaStream();
    try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
    try { localStream.addTrack(track); } catch {}

    // Fan-out to all peers that already have a baseline video sender
    for (const [peerId, sender] of videoSenderByPeer.entries()) {
      try {
        await sender?.replaceTrack?.(track);
        console.log(`🟩 [mesh] applied local video to ${peerId}`);
      } catch (e) {
        console.warn(`[mesh] failed to apply local video to ${peerId}:`, e);
      }
    }

    UI_addVideoTile?.('local', localStream, { label: 'You', muted: true });
    cameraOn = true;
    console.log('🟩 [mesh] camera ON (track applied to all peers present)');
    return true;
  }

  return cameraOn;
}

// Mic toggle (enable/disable local mic)
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
