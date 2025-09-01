// start__camera_tracks_and_video_flow
import { UI_addVideoTile, UI_removeVideoTile } from './ui.js';

let pc = null;
let localStream = null;
let remoteStream = null;

let _sendSignal = null;
let _onConnecting = () => {};
let _onConnected = () => {};
let _onTeardown = () => {};
let _unsubscribeSignal = null;

let _started = false;
let _pendingICE = [];

// 🎚️ Meter bits (kept from existing file)
let _audioCtx = null;
let _analyser = null;
let _srcNode = null;
let _rafId = null;

// New: local camera track state
let _localVideoTrack = null;
let _cameraOn = false;

export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

export async function RTC_start({
  roomId,
  sendSignal,
  onSignal,
  onConnecting,
  onConnected,
  onTeardown,
  inboundOffer = null,
  pendingCandidates = []
}) {
  _sendSignal = sendSignal;
  _onConnecting = onConnecting || (() => {});
  _onConnected  = onConnected  || (() => {});
  _onTeardown   = onTeardown   || (() => {});
  _started = true;

  // Start with audio only; camera can be toggled later
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); // video added by toggle
  pc = createPeer();

  // Add local audio tracks
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // Draw level meter
  startLevelMeter(localStream);

  // Buffer any pre-ICE
  _pendingICE = [];

  // Listen for inbound SDP/candidates
  _unsubscribeSignal = onSignal(async ({ payload }) => {
    if (!pc) pc = createPeer();

    if (payload?.type === 'offer') {
      _onConnecting();
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      _sendSignal(pc.localDescription);
    } else if (payload?.type === 'answer') {
      await pc.setRemoteDescription(payload);
    } else if (payload?.candidate) {
      try { await pc.addIceCandidate(payload); }
      catch { _pendingICE.push(payload); }
    }
  });

  if (inboundOffer) {
    _onConnecting();
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    _sendSignal(pc.localDescription);

    for (const cand of [...pendingCandidates, ..._pendingICE]) {
      try { await pc.addIceCandidate(cand); } catch {}
    }
    _pendingICE = [];
  } else {
    _onConnecting();
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true   // allow remote video if they send it
    });
    await pc.setLocalDescription(offer);
    _sendSignal(pc.localDescription);
  }

  // Show a local preview tile if/when camera gets enabled later
  // (We create the tile when we actually add the video track)
}

function createPeer() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) _sendSignal(e.candidate.toJSON());
  };

  pc.ontrack = (e) => {
    // Handle remote tracks (audio and/or video)
    if (!remoteStream) remoteStream = new MediaStream();
    remoteStream.addTrack(e.track);

    if (e.track.kind === 'audio') {
      const audioEl = document.getElementById('rtc-remote-audio');
      if (audioEl && audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
      }
    }

    if (e.track.kind === 'video') {
      // Put remote video into a dynamic tile
      UI_addVideoTile('remote', remoteStream, { label: 'Remote', muted: false });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') _onConnected();
  };

  pc.oniceconnectionstatechange = async () => {
    if (pc.iceConnectionState === 'connected' && _pendingICE.length) {
      for (const cand of _pendingICE.splice(0)) {
        try { await pc.addIceCandidate(cand); } catch {}
      }
    }
  };

  return pc;
}

/** Toggle camera on/off, renegotiating if needed */
export async function RTC_setCameraEnabled(enabled) {
  if (!pc) throw new Error('Peer connection not ready');

  if (enabled && !_cameraOn) {
    // get a fresh video track
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = camStream.getVideoTracks();
    if (!track) throw new Error('No camera track available');

    _localVideoTrack = track;
    // add to the RTCPeerConnection
    pc.addTrack(_localVideoTrack, camStream);

    // Build or update local composite stream to preview
    if (!localStream) localStream = new MediaStream();
    localStream.addTrack(_localVideoTrack);

    // Show/update local tile
    UI_addVideoTile('local', localStream, { label: 'You', muted: true });

    _cameraOn = true;
    await renegotiate();
    return true;
  }

  if (!enabled && _cameraOn) {
    try {
      // find sender of our current local video track
      const sender = pc.getSenders().find(s => s.track === _localVideoTrack);
      try { sender?.replaceTrack?.(null); } catch {}
      try { sender && pc.removeTrack(sender); } catch {}

      // stop and remove from local stream
      try { _localVideoTrack.stop(); } catch {}
      try { localStream?.removeTrack?.(_localVideoTrack); } catch {}
    } finally {
      _localVideoTrack = null;
      _cameraOn = false;

      // remove local tile (but keep remote if present)
      UI_removeVideoTile('local');

      await renegotiate();
      return false;
    }
  }

  return _cameraOn;
}

/** Force an SDP renegotiation (offer → signal → remote answers back) */
async function renegotiate() {
  if (!pc) return;
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  _sendSignal(pc.localDescription);
}

export function RTC_setMicEnabled(enabled) {
  try {
    const tracks = localStream?.getAudioTracks?.() || [];
    tracks.forEach(t => { t.enabled = !!enabled; });
    return tracks[0] ? tracks[0].enabled : false;
  } catch {
    return false;
  }
}

export function RTC_teardownAll() {
  try { _unsubscribeSignal?.(); } catch {}
  _unsubscribeSignal = null;

  try {
    if (pc) {
      pc.getSenders().forEach(s => s.track && s.track.stop());
      pc.close();
    }
  } catch {}
  pc = null;

  stopLevelMeter();

  try {
    localStream?.getTracks()?.forEach(t => t.stop());
  } catch {}
  localStream = null;

  try {
    const audioEl = document.getElementById('rtc-remote-audio');
    if (audioEl) audioEl.srcObject = null;
  } catch {}

  // remove video tiles
  UI_removeVideoTile('local');
  UI_removeVideoTile('remote');

  _cameraOn = false;
  _localVideoTrack = null;

  _started = false;
  _onTeardown();
}

// (meter helpers remain unchanged below)
// end__camera_tracks_and_video_flow

/* =========================
   🎚️ Level Meter (local)
   ========================= */
function startLevelMeter(stream) {
  stopLevelMeter(); // safety

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

      // If mic is muted (track.enabled=false), show zero
      const enabled = stream?.getAudioTracks?.()[0]?.enabled !== false;

      _analyser.getFloatTimeDomainData(data);

      // RMS
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      let rms = Math.sqrt(sum / data.length);

      if (!enabled) rms = 0;

      // Map RMS (~0..0.5) to 0..1
      const level = Math.min(1, rms * 3);

      // Draw bar
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // background
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(0, 0, w, h);

      // bar
      const barW = Math.max(1, Math.floor(w * level));
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(0, 0, barW, h);

      // border (subtle, already have CSS border)
      // ctx.strokeStyle = '#ddd'; ctx.strokeRect(0, 0, w, h);
    };

    draw();
  } catch (e) {
    // If AudioContext fails (e.g., autoplay policies), just ignore silently
    // and skip drawing the meter.
  }
}

function stopLevelMeter() {
  try {
    if (_rafId) cancelAnimationFrame(_rafId);
  } catch {}
  _rafId = null;

  try {
    if (_srcNode) _srcNode.disconnect();
    if (_analyser) _analyser.disconnect();
  } catch {}
  _srcNode = null;
  _analyser = null;

  try {
    _audioCtx?.close();
  } catch {}
  _audioCtx = null;

  // Clear canvas
  try {
    const canvas = document.getElementById('rtc-level-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  } catch {}
}
