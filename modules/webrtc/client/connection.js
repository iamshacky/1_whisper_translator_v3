// modules/webrtc/client/connection.js
// Mesh: one RTCPeerConnection per peerId. Audio-first; optional camera track shared to all peers.

import {
  RTC_upsertLocalTile,
  RTC_upsertRemoteTile,
  RTC_removeRemoteTile,
  RTC_clearVideoGrid
} from './ui.js';

let _sendSignal = null;
let _onConnecting = () => {};
let _onConnected = () => {};
let _onTeardown = () => {};
let _started = false;

let _meId = null;
let _roomId = null;

// Local media
let localMicStream = null;       // audio-only
let localVideoTrack = null;      // optional
let localPreviewStream = null;   // stream containing the video track for UI

// Peers: peerId -> { pc, remoteStream, pendingICE:[], connected:boolean }
const peers = new Map();

// 🎚️ Meter
let _audioCtx = null, _analyser = null, _srcNode = null, _rafId = null;

export function RTC_isStarted() { return _started; }

export async function RTC_start({
  meId,
  roomId,
  sendSignal,
  onConnecting,
  onConnected,
  onTeardown
}) {
  _meId = meId;
  _roomId = roomId;
  _sendSignal = sendSignal;
  _onConnecting = onConnecting || (() => {});
  _onConnected  = onConnected  || (() => {});
  _onTeardown   = onTeardown   || (() => {});
  _started = true;

  // Audio first
  localMicStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });

  startLevelMeter(localMicStream);
}

export function RTC_teardownAll() {
  // close peers
  for (const [peerId, p] of peers) {
    try { p.pc.getSenders().forEach(s => s.track && s.track.stop()); } catch {}
    try { p.pc.close(); } catch {}
    RTC_removeRemoteTile(peerId);
  }
  peers.clear();

  stopLevelMeter();

  try { localMicStream?.getTracks()?.forEach(t => t.stop()); } catch {}
  localMicStream = null;

  try { localVideoTrack?.stop(); } catch {}
  localVideoTrack = null;

  try {
    if (localPreviewStream) {
      localPreviewStream.getTracks().forEach(t => t.stop());
    }
  } catch {}
  localPreviewStream = null;
  RTC_clearVideoGrid();

  _started = false;
  _onTeardown();
}

/** Called by init.js when presence updates; connects to new peers. */
export async function RTC_connectToPeers(peerIds) {
  if (!_started) return;
  // Determine initiator to avoid glare: meId < peerId
  for (const peerId of peerIds) {
    if (peerId === _meId) continue;
    if (peers.has(peerId)) continue;
    const initiator = _meId < peerId;
    await ensurePeer(peerId, { initiator });
  }
}

/** Handle incoming signaling payload from a peer */
export async function RTC_handleSignal(from, payload) {
  if (!_started) return;

  let p = peers.get(from);
  if (!p) p = await ensurePeer(from, { initiator: false }); // if peer called us

  if (payload?.type === 'offer') {
    _onConnecting();
    await p.pc.setRemoteDescription(payload);
    const answer = await p.pc.createAnswer();
    await p.pc.setLocalDescription(answer);
    _sendSignal({ ...p.pc.localDescription.toJSON(), to: from });
  } else if (payload?.type === 'answer') {
    await p.pc.setRemoteDescription(payload);
    _onConnected();
  } else if (payload?.candidate) {
    try { await p.pc.addIceCandidate(payload); }
    catch { p.pendingICE.push(payload); }
  }
}

/** Mic mute across all peers (track.enabled) */
export function RTC_setMicEnabled(enabled) {
  try {
    const tracks = localMicStream?.getAudioTracks?.() || [];
    tracks.forEach(t => t.enabled = !!enabled);
    return tracks[0] ? tracks[0].enabled : false;
  } catch { return false; }
}

/** Camera on/off: add/remove track to all peer connections + show local preview */
export async function RTC_setCameraEnabled(on) {
  if (!_started) return false;

  if (on) {
    if (localVideoTrack) return true;
    const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = vStream.getVideoTracks();
    if (!track) return false;

    localVideoTrack = track;

    // local preview stream
    localPreviewStream = new MediaStream([track]);
    RTC_upsertLocalTile(localPreviewStream);

    for (const [, p] of peers) {
      const sender = p.pc.addTrack(track, new MediaStream([track]));
      p.videoSender = sender;
      await renegotiate(p);
    }
    return true;
  } else {
    if (!localVideoTrack) return false;

    // remove from all peers
    for (const [, p] of peers) {
      try {
        const sender = p.videoSender || p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) p.pc.removeTrack(sender);
      } catch {}
      await renegotiate(p);
    }

    try { localVideoTrack.stop(); } catch {}
    localVideoTrack = null;

    try {
      if (localPreviewStream) localPreviewStream.getTracks().forEach(t => t.stop());
    } catch {}
    localPreviewStream = null;
    RTC_upsertLocalTile(null);

    return false;
  }
}

/* ------------------ internals ------------------ */

/* Start connection.js__ensurePeer_onnegstate */
async function ensurePeer(peerId, { initiator }) {
  // If already have a peer, just return it
  if (peers.has(peerId)) return peers.get(peerId);

  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const remoteStream = new MediaStream();
  const pendingICE = [];
  const record = { pc, remoteStream, pendingICE, connected: false, videoSender: null };

  // local tracks
  localMicStream.getTracks().forEach(t => pc.addTrack(t, localMicStream));
  if (localVideoTrack) {
    const sender = pc.addTrack(localVideoTrack, new MediaStream([localVideoTrack]));
    record.videoSender = sender;
  }

  pc.onicecandidate = (e) => { if (e.candidate) _sendSignal({ ...e.candidate.toJSON(), to: peerId }); };

  pc.onnegotiationneeded = async () => {
    // Renegotiate when local tracks change (e.g., camera on/off) and we initiated this peer
    if (!peers.get(peerId)) return;
    if (!initiator) return; // prevent glare
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      _sendSignal({ ...pc.localDescription.toJSON(), to: peerId });
    } catch {}
  };

  pc.ontrack = (e) => {
    if (e.streams && e.streams[0]) e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    else remoteStream.addTrack(e.track);
    // label comes from presence map in UI
    RTC_upsertRemoteTile(peerId, null, remoteStream);
  };

  pc.oniceconnectionstatechange = async () => {
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
      RTC_hangupPeer(peerId);
    } else if (pc.iceConnectionState === 'connected' && pendingICE.length) {
      for (const cand of pendingICE.splice(0)) { try { await pc.addIceCandidate(cand); } catch {} }
    }
  };

  peers.set(peerId, record);

  if (initiator) {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      _sendSignal({ ...pc.localDescription.toJSON(), to: peerId });
    } catch {}
  }

  return record;
}
/* End connection.js__ensurePeer_onnegstate */

async function renegotiate(p) {
  const offer = await p.pc.createOffer();
  await p.pc.setLocalDescription(offer);
  _sendSignal({ ...p.pc.localDescription.toJSON(), to: findPeerIdByPc(p.pc) });
}

function findPeerIdByPc(pc) {
  for (const [id, obj] of peers) if (obj.pc === pc) return id;
  return null;
}

/* ====== Meter (local) ====== */
function startLevelMeter(stream) {
  stopLevelMeter();
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _srcNode = _audioCtx.createMediaStreamSource(stream);
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 2048;
    _srcNode.connect(_analyser);

    const canvas = document.getElementById('rtc-level-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const data = new Float32Array(_analyser.fftSize);

    const draw = () => {
      _rafId = requestAnimationFrame(draw);
      const enabled = stream?.getAudioTracks?.()[0]?.enabled !== false;
      _analyser.getFloatTimeDomainData(data);
      let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      let rms = Math.sqrt(sum / data.length);
      if (!enabled) rms = 0;
      const level = Math.min(1, rms * 3);

      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f3f3f3'; ctx.fillRect(0, 0, w, h);
      const barW = Math.max(1, Math.floor(w * level));
      ctx.fillStyle = '#4caf50'; ctx.fillRect(0, 0, barW, h);
    };
    draw();
  } catch {}
}
function stopLevelMeter() {
  try { if (_rafId) cancelAnimationFrame(_rafId); } catch {}
  _rafId = null;
  try { if (_srcNode) _srcNode.disconnect(); if (_analyser) _analyser.disconnect(); } catch {}
  _srcNode = _analyser = null;
  try { _audioCtx?.close(); } catch {}
  _audioCtx = null;
}

/* Start connection.js__peer_helpers */
// Return current peer ids (used to send 'bye' to each peer on End Call)
export function RTC_getPeerIds() {
  return Array.from(peers.keys());
}

// Close a single peer (used on remote/local hangup + presence shrink)
export function RTC_hangupPeer(peerId) {
  const p = peers.get(peerId);
  if (!p) return;
  try { p.pc.getSenders().forEach(s => s.track && s.track.stop()); } catch {}
  try { p.pc.close(); } catch {}
  peers.delete(peerId);
  RTC_removeRemoteTile(peerId);
}
/* End connection.js__peer_helpers */
