// modules/webrtc/client/connection.js
// Audio call + video on/off + mic toggle + analyser meter + renegotiation

let pc = null;
let localMicStream = null;        // audio-only stream
let localVideoTrack = null;       // single video track (when camera on)
let remoteStream = null;          // combined A/V

let _sendSignal = null;
let _onConnecting = () => {};
let _onConnected = () => {};
let _onTeardown = () => {};
let _unsubscribeSignal = null;

let _started = false;
let _pendingICE = [];

// 🎚️ Meter
let _audioCtx = null, _analyser = null, _srcNode = null, _rafId = null;

export function RTC_isStarted() { return _started; }

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
  _sendSignal   = sendSignal;
  _onConnecting = onConnecting || (() => {});
  _onConnected  = onConnected  || (() => {});
  _onTeardown   = onTeardown   || (() => {});
  _started = true;

  // Audio first; request camera only when user toggles camera on
  localMicStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });

  pc = createPeer();

  // add audio tracks
  localMicStream.getTracks().forEach(t => pc.addTrack(t, localMicStream));

  // level meter
  startLevelMeter(localMicStream);

  _pendingICE = [];

  // inbound signaling
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
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    _sendSignal(pc.localDescription);
  }
}

function createPeer() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.onicecandidate = (e) => { if (e.candidate) _sendSignal(e.candidate.toJSON()); };

  pc.ontrack = (e) => {
    if (!remoteStream) remoteStream = new MediaStream();
    remoteStream.addTrack(e.track);

    const audioEl = document.getElementById('rtc-remote-audio');
    if (audioEl && audioEl.srcObject !== remoteStream) audioEl.srcObject = remoteStream;

    const remoteVideo = document.getElementById('rtc-remote-video');
    if (remoteVideo && remoteVideo.srcObject !== remoteStream) remoteVideo.srcObject = remoteStream;
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

/** Mic mute: enabled=true = unmuted (track.enabled) */
export function RTC_setMicEnabled(enabled) {
  try {
    const tracks = localMicStream?.getAudioTracks?.() || [];
    tracks.forEach(t => { t.enabled = !!enabled; });
    return tracks[0] ? tracks[0].enabled : false;
  } catch {
    return false;
  }
}

/** Camera on/off with renegotiation */
export async function RTC_setCameraEnabled(on) {
  if (!_started || !pc) return false;

  if (on) {
    if (localVideoTrack) return true; // already on
    // request camera
    const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = vStream.getVideoTracks();
    if (!track) return false;

    localVideoTrack = track;

    // local preview
    try {
      const localVideo = document.getElementById('rtc-local-video');
      if (localVideo) {
        const s = new MediaStream([track]);
        localVideo.srcObject = s;
      }
    } catch {}

    pc.addTrack(track, new MediaStream([track]));

    // renegotiate
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    _sendSignal(pc.localDescription);
    return true;
  } else {
    if (!localVideoTrack) return false;

    // stop sending
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    try {
      if (sender) pc.removeTrack(sender);
    } catch {}
    try { localVideoTrack.stop(); } catch {}
    localVideoTrack = null;

    // clear preview
    try {
      const localVideo = document.getElementById('rtc-local-video');
      if (localVideo) localVideo.srcObject = null;
    } catch {}

    // renegotiate
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    _sendSignal(pc.localDescription);
    return false;
  }
}

export function RTC_teardownAll() {
  try { if (_unsubscribeSignal) _unsubscribeSignal(); } catch {}
  _unsubscribeSignal = null;

  try {
    if (pc) {
      pc.getSenders().forEach(s => s.track && s.track.stop());
      pc.close();
    }
  } catch {}
  pc = null;

  stopLevelMeter();

  try { localMicStream?.getTracks()?.forEach(t => t.stop()); } catch {}
  localMicStream = null;

  try { if (localVideoTrack) localVideoTrack.stop(); } catch {}
  localVideoTrack = null;

  try {
    const audioEl = document.getElementById('rtc-remote-audio');
    if (audioEl) audioEl.srcObject = null;
    const remoteVideo = document.getElementById('rtc-remote-video');
    if (remoteVideo) remoteVideo.srcObject = null;
    const localVideo = document.getElementById('rtc-local-video');
    if (localVideo) localVideo.srcObject = null;
  } catch {}

  _started = false;
  _onTeardown();
}

/* =========================
   🎚️ Level Meter (local)
   ========================= */
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
  try {
    const canvas = document.getElementById('rtc-level-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  } catch {}
}
