// modules/webrtc/client/connection.js
// Start/End call control + minimal 1:1 connection + mic toggle + incoming-offer support + input level meter

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

// 🎚️ Meter bits
let _audioCtx = null;
let _analyser = null;
let _srcNode = null;
let _rafId = null;

export function RTC_isStarted() {
  return _started;
}

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

  // Prepare local media on demand (no auto-start)
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); // add {video:true} later
  pc = createPeer();

  // Add local tracks
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // Start level meter
  startLevelMeter(localStream);

  // Buffer any candidates that arrive before pc is ready
  _pendingICE = [];

  // Listen for inbound signaling (offer/answer/candidates)
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
      // If remote description not set yet, adding ICE may fail; buffer then try
      try { await pc.addIceCandidate(payload); }
      catch { _pendingICE.push(payload); }
    }
  });

  // If we were started due to an inbound offer (user accepted), answer it
  if (inboundOffer) {
    _onConnecting();
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    _sendSignal(pc.localDescription);

    // Apply any pending candidates collected before start
    for (const cand of [...pendingCandidates, ..._pendingICE]) {
      try { await pc.addIceCandidate(cand); } catch {}
    }
    _pendingICE = [];
  } else {
    // Outbound offer path
    _onConnecting();
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    _sendSignal(pc.localDescription);
  }
}

function createPeer() {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) _sendSignal(e.candidate.toJSON());
  };

  pc.ontrack = (e) => {
    if (!remoteStream) remoteStream = new MediaStream();
    remoteStream.addTrack(e.track);
    const audioEl = document.getElementById('rtc-remote-audio');
    if (audioEl && audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
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

export function RTC_setMicEnabled(enabled) {
  // enabled=true -> unmuted (track.enabled = true)
  // returns current track.enabled (boolean) or false if no track
  try {
    const tracks = localStream?.getAudioTracks?.() || [];
    tracks.forEach(t => { t.enabled = !!enabled; });
    return tracks[0] ? tracks[0].enabled : false;
  } catch {
    return false;
  }
}

export function RTC_teardownAll() {
  try {
    if (_unsubscribeSignal) _unsubscribeSignal();
  } catch {}
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

  _started = false;
  _onTeardown();
}

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
