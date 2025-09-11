// modules/webrtc/client/connection.js
// Multi-peer WebRTC mesh with stable m-line order, perfect negotiation,
// per-peer senders/transceivers, auto-rejoin, and per-tile audio routing.

import { UI_addVideoTile, UI_removeVideoTile, RTC_setStartActive } from './ui.js';

const pcByPeer = new Map();                 // peerId -> RTCPeerConnection
const remoteStreamByPeer = new Map();       // peerId -> MediaStream
const pendingICEByPeer = new Map();         // peerId -> RTCIceCandidateInit[]
const politeByPeer = new Map();             // peerId -> boolean
const makingOfferByPeer = new Map();        // peerId -> boolean
const sendersByPeer = new Map();            // peerId -> { audioTx, videoTx, audioSender, videoSender }

let localStream = null;
let _localAudioTrack = null;
let _localVideoTrack = null;
let _cameraOn = false;

let _sendSignal = null;
let _started = false;
let _selfId = null;
let _onMeshIdle = null;

function ensurePending(peerId) {
  if (!pendingICEByPeer.has(peerId)) pendingICEByPeer.set(peerId, []);
  return pendingICEByPeer.get(peerId);
}
function sendTo(peerId, payload) { _sendSignal?.({ to: peerId, payload }); }
function anyPeerConnected() { return [...pcByPeer.values()].some(pc => pc.connectionState === 'connected'); }
function anyPeerConnecting() { return [...pcByPeer.values()].some(pc => (pc.connectionState === 'connecting' || pc.connectionState === 'new')); }
function recomputeStartActive() {
  const connected = anyPeerConnected();
  RTC_setStartActive(connected);
  if (!connected && !anyPeerConnecting()) { _started = false; _onMeshIdle?.(); }
}
function labelForPeer(peerId) {
  try {
    const hit = (window.__lastPresence || []).find(p => p.clientId === peerId);
    return hit?.username || 'Remote';
  } catch { return 'Remote'; }
}
function computePolite(peerId, inboundOffer = false) {
  if (inboundOffer) return true;
  if (!_selfId) return false;
  return String(_selfId) > String(peerId);
}
function pcIsClosed(pc) { return !pc || pc.signalingState === 'closed' || pc.connectionState === 'closed'; }

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

/* ───────────────── SDP MUNGER ─────────────────
   Keep only the first audio + first video m-sections.
   Drop any extras and fix the BUNDLE group accordingly.
*/
function sanitizeOfferKeepFirstAv(offerSDP) {
  const blocks = offerSDP.split(/\r?\n(?=m=)/); // split at m-lines, keep headers with previous block
  const head = [];
  const medias = [];
  // Extract session head (everything before first m= line)
  const firstM = offerSDP.search(/\r?\nm=/);
  if (firstM === -1) return offerSDP;
  head.push(offerSDP.slice(0, firstM).replace(/\r?\n$/,''));

  // Collect m-blocks
  const tail = offerSDP.slice(firstM + offerSDP.match(/\r?\n/)[0].length - 1);
  // We already split roughly; rebuild a safer list
  const lines = offerSDP.split(/\r?\n/);
  const mIdxs = [];
  lines.forEach((l,i)=>{ if (l.startsWith('m=')) mIdxs.push(i); });
  const chunks = [];
  for (let k=0;k<mIdxs.length;k++){
    const start = mIdxs[k];
    const end = (k+1<mIdxs.length) ? mIdxs[k+1] : lines.length;
    chunks.push(lines.slice(start,end));
  }

  let keptAudio = false, keptVideo = false;
  const kept = [];

  for (const chunk of chunks) {
    const m = chunk[0];
    if (m.startsWith('m=audio') && !keptAudio) { keptAudio = true; kept.push(chunk); continue; }
    if (m.startsWith('m=video') && !keptVideo) { keptVideo = true; kept.push(chunk); continue; }
    // drop this entire m-section
  }

  // If remote sent only one kind, still fine. Recompute BUNDLE mids for kept sections.
  const mids = [];
  kept.forEach(sec => {
    let mid = sec.find(l => l.startsWith('a=mid:'));
    if (!mid) {
      // Be defensive: if no mid, synthesize sequential mids "0","1"
      mid = `a=mid:${mids.length}`;
      sec.splice(1, 0, mid);
    }
    mids.push(mid.slice(6));
  });

  // Rebuild head with corrected a=group:BUNDLE
  const rebuiltHead = head[0]
    .split(/\r?\n/)
    .map(l => {
      if (l.startsWith('a=group:BUNDLE ')) {
        return `a=group:BUNDLE ${mids.join(' ')}`;
      }
      return l;
    })
    .join('\r\n');

  const rebuilt = [rebuiltHead, ...kept.map(sec => sec.join('\r\n'))].join('\r\n') + '\r\n';
  return rebuilt;
}

async function drainPendingICE(peerId, extra = []) {
  const pc = pcByPeer.get(peerId);
  if (!pc || !pc.remoteDescription) return;
  const bucket = ensurePending(peerId);
  const all = [...extra, ...bucket];
  for (const cand of all) {
    try { await pc.addIceCandidate(cand); } catch {}
  }
  bucket.length = 0;
}

// ─────────── Local media (created lazily) ───────────
async function ensureLocalAudioTrack() {
  if (_localAudioTrack && _localAudioTrack.readyState === 'live') return _localAudioTrack;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  _localAudioTrack = mic.getAudioTracks()[0] || null;
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
  _localVideoTrack = cam.getVideoTracks()[0] || null;
  if (_localVideoTrack) {
    if (!localStream) localStream = new MediaStream();
    localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(_localVideoTrack);
  }
  return _localVideoTrack;
}

// ─────── Baseline transceivers per peer (AUDIO first, VIDEO second) ───────
function ensureBaseTransceivers(peerId, pc) {
  if (sendersByPeer.has(peerId)) return sendersByPeer.get(peerId);
  const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
  const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
  const bundle = { audioTx, videoTx, audioSender: audioTx.sender, videoSender: videoTx.sender };
  sendersByPeer.set(peerId, bundle);
  return bundle;
}

// ─────────── Peer factory ───────────
function ensurePeerConnection(peerId) {
  if (pcByPeer.has(peerId)) return pcByPeer.get(peerId);

  const pc = new RTCPeerConnection({
    bundlePolicy: 'max-bundle',
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

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

  pc.onnegotiationneeded = async () => {
    try {
      if (pc.signalingState !== 'stable') return;
      if (makingOfferByPeer.get(peerId)) return;
      makingOfferByPeer.set(peerId, true);
      const offer = await pc.createOffer();
      // Our side only has 2 m-lines; send as-is.
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
  sendersByPeer.delete(peerId);

  try { UI_removeVideoTile?.(peerId); } catch {}
  recomputeStartActive();
}

// ─────────── Public API ───────────
export function RTC_setSignalSender(fn) { _sendSignal = (typeof fn === 'function') ? fn : null; }
export function RTC_setSelfId(id) { _selfId = id || null; }
export function RTC_onMeshIdle(cb) { _onMeshIdle = (typeof cb === 'function') ? cb : null; }
export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

export async function RTC_startPeer(peerId, { inboundOffer = null, pendingCandidates = [] } = {}) {
  console.log('[mesh] RTC_startPeer →', peerId, inboundOffer ? '(with inbound offer)' : '');
  _started = true;

  const pc = ensurePeerConnection(peerId);
  const snd = ensureBaseTransceivers(peerId, pc);

  // Attach tracks if already available (no new m-lines)
  try {
    if (!_localAudioTrack) _localAudioTrack = (await ensureLocalAudioTrack()) || null;
    await snd.audioSender.replaceTrack(_localAudioTrack || null);
  } catch {}
  try { await snd.videoSender.replaceTrack(_localVideoTrack || null); } catch {}

  politeByPeer.set(peerId, computePolite(peerId, !!inboundOffer));

  if (inboundOffer) {
    const patched = { type: 'offer', sdp: sanitizeOfferKeepFirstAv(inboundOffer.sdp || '') };
    await pc.setRemoteDescription(patched);
    if (makingOfferByPeer.get(peerId)) await pc.setLocalDescription({ type: 'rollback' });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendTo(peerId, pc.localDescription);

    await drainPendingICE(peerId, pendingCandidates);
  } else {
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
      if (collision) await pc.setLocalDescription({ type: 'rollback' });

      const patched = { type: 'offer', sdp: sanitizeOfferKeepFirstAv(payload.sdp || '') };
      await pc.setRemoteDescription(patched);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTo(peerId, pc.localDescription);
      await drainPendingICE(peerId);
    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(payload);
      await drainPendingICE(peerId);
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
  for (const id of Array.from(pcByPeer.keys())) closePeer(id);
  try { localStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  localStream = null;
  _localAudioTrack = null;
  _localVideoTrack = null;
  _cameraOn = false;
  _started = false;
  RTC_setStartActive(false);
}

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

export function RTC_setMicEnabled(enabled) {
  try {
    if (_localAudioTrack) _localAudioTrack.enabled = !!enabled;
    (localStream?.getAudioTracks?.() || []).forEach(a => a.enabled = !!enabled);
    return _localAudioTrack?.enabled ?? (localStream?.getAudioTracks?.()[0]?.enabled ?? false);
  } catch { return false; }
}
