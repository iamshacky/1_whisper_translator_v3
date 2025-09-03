// start__improve_camera_toggle_replaceTrack
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

// 🎚️ Meter bits
let _audioCtx = null;
let _analyser = null;
let _srcNode = null;
let _rafId = null;

// 🔁 Camera state + sender handle
let _localVideoTrack = null;
let _videoSender = null;       // ⬅️ keep the sender so we can replaceTrack()
let _cameraOn = false;
let _audioSender = null;
let _videoTx = null; // store video transceiver

// start__perfect_negotiation_vars
let _makingOffer = false;
let _ignoreOffer = false;
let _isSettingRemoteAnswerPending = false;
// end__perfect_negotiation_vars


export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

// start__simplify_RTC_start_transceivers
export async function RTC_start({
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

  pc = createPeer();

  _pendingICE = [];

  // 🔔 Perfect negotiation signaling
  _unsubscribeSignal = onSignal(async ({ payload }) => {
    if (!pc) pc = createPeer();

    try {
      if (payload?.type === 'offer') {
        const offerCollision = _makingOffer || pc.signalingState !== 'stable';
        _ignoreOffer = !polite && offerCollision;
        if (_ignoreOffer) {
          console.log('🙈 Ignoring remote offer (impolite & collision)');
          return;
        }

        if (offerCollision) {
          console.log('↩️ Offer collision — rolling back local description');
          await Promise.allSettled([
            pc.setLocalDescription({ type: 'rollback' }),
          ]);
        }

        await pc.setRemoteDescription(payload);
        _onConnecting();

        _isSettingRemoteAnswerPending = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        _isSettingRemoteAnswerPending = false;
        _sendSignal(pc.localDescription);

      } else if (payload?.type === 'answer') {
        if (_isSettingRemoteAnswerPending) return; // should be false here, but guard anyway
        await pc.setRemoteDescription(payload);

      } else if (payload?.candidate) {
        try { await pc.addIceCandidate(payload); }
        catch { _pendingICE.push(payload); }
      }
    } catch (err) {
      console.warn('⚠️ Signaling handler error:', err);
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
    // ⚠️ Do not add tracks/transceivers here — handled lazily by RTC_setCameraEnabled
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    _sendSignal(pc.localDescription);
  }
}
// end__simplify_RTC_start_transceivers

// start__negotiationneeded_guard_and_cleanup
function createPeer() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) _sendSignal(e.candidate.toJSON());
  };

  pc.ontrack = (e) => {
    if (!remoteStream) remoteStream = new MediaStream();
    remoteStream.addTrack(e.track);

    if (e.track.kind === 'audio') {
      const audioEl = document.getElementById('rtc-remote-audio');
      if (audioEl && audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
      }
    }

    if (e.track.kind === 'video') {
      console.log('🎥 [remote] ontrack video — remote is receiving frames');
      try {
        if (typeof UI_addVideoTile === 'function') {
          UI_addVideoTile('remote', remoteStream, { label: 'Remote', muted: false });
        }
      } catch {}
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('🔗 PC state:', pc.connectionState);
    if (pc.connectionState === 'connected') _onConnected();
  };

  pc.oniceconnectionstatechange = async () => {
    console.log('🧊 ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' && _pendingICE.length) {
      for (const cand of _pendingICE.splice(0)) {
        try { await pc.addIceCandidate(cand); } catch {}
      }
    }
  };

  // ✅ Perfect-negotiation friendly negotiationneeded
  pc.onnegotiationneeded = async () => {
    try {
      if (!pc || pc.signalingState !== 'stable') return;
      if (_makingOffer) return;
      _makingOffer = true;
      console.log('📡 negotiationneeded → creating and sending offer');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      _makingOffer = false;
      _sendSignal(pc.localDescription);
    } catch (e) {
      _makingOffer = false;
      console.warn('⚠️ negotiationneeded failed:', e);
    }
  };

  return pc;
}
// end__add_onnegotiationneeded_in_createPeer

// start__cleaner_transceiver_init_in_setCameraEnabled
export async function RTC_setCameraEnabled(enabled) {
  if (!pc) throw new Error('Peer connection not ready');

  // 🔑 Ensure base transceivers exist in stable order
  if (!_audioSender || !_videoTx) {
    console.log('🎛️ Creating base transceivers (audio → video)');
    // 1. Audio first
    const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    _audioSender = audioTx.sender;

    // Get mic track and attach
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [micTrack] = micStream.getAudioTracks();
    if (micTrack) {
      if (!localStream) localStream = new MediaStream();
      localStream.addTrack(micTrack);
      await _audioSender.replaceTrack(micTrack);
    }

    // 2. Video second
    _videoTx = pc.addTransceiver('video', { direction: 'recvonly' });
    _videoSender = _videoTx.sender;

    // Start audio level meter once mic is live
    startLevelMeter(localStream);
  }

  // 🚦 Camera toggle
  if (enabled && !_cameraOn) {
    console.log('🎬 [local] Enabling camera…');

    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [newTrack] = camStream.getVideoTracks();
    if (!newTrack) throw new Error('No camera track available');

    _localVideoTrack = newTrack;

    // Update local preview
    try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
    localStream.addTrack(newTrack);

    console.log('🔁 [local] replaceTrack on video sender');
    await _videoSender.replaceTrack(newTrack);

    if (_videoTx.direction !== 'sendrecv') {
      console.log('🔄 [local] set video transceiver direction → sendrecv');
      _videoTx.direction = 'sendrecv';
    }

    try { UI_addVideoTile('local', localStream, { label: 'You', muted: true }); } catch {}
    _cameraOn = true;
    console.log('✅ [local] Camera ON (sender present:', !!_videoSender, ')');
    return true;
  }

  if (!enabled && _cameraOn) {
    console.log('🛑 [local] Disabling camera…');
    try {
      if (_videoSender) {
        await _videoSender.replaceTrack(null);
      }
      _localVideoTrack?.stop();
      _localVideoTrack = null;

      try { localStream?.getVideoTracks()?.forEach(t => localStream.removeTrack(t)); } catch {}

      if (_videoTx && _videoTx.direction !== 'recvonly') {
        console.log('🔄 [local] set video transceiver direction → recvonly');
        _videoTx.direction = 'recvonly';
      }

      try { UI_removeVideoTile('local'); } catch {}
      _cameraOn = false;
      console.log('✅ [local] Camera OFF');
    } catch (e) {
      console.warn('⚠️ [local] Error disabling camera:', e);
    }
    return false;
  }

  console.log('ℹ️ [local] Camera state unchanged:', _cameraOn);
  return _cameraOn;
}
// end__cleaner_transceiver_init_in_setCameraEnabled


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

  UI_removeVideoTile('local');
  UI_removeVideoTile('remote');

  _cameraOn = false;
  _localVideoTrack = null;
  _videoSender = null;

  _started = false;
  _onTeardown();
}
// end__improve_camera_toggle_replaceTrack

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
