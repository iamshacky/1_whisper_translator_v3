// modules/webrtc/client/connection.js
// 1:1 WebRTC with stable m-line order, perfect negotiation, and lazy camera toggle.
// Video tiles are injected via UI_addVideoTile/UI_removeVideoTile.

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

// 🎛 perfect negotiation flags
let _makingOffer = false;
let _ignoreOffer = false;
let _isSettingRemoteAnswerPending = false;

// 🎚️ Meter bits
let _audioCtx = null;
let _analyser = null;
let _srcNode = null;
let _rafId = null;

// 🔁 Media handles
let _audioSender = null;
let _videoTx = null;
let _videoSender = null;
let _localVideoTrack = null;
let _cameraOn = false;

export function RTC_isStarted() { return _started; }
export function RTC_isCameraOn() { return _cameraOn; }

/* ----------------------------
   🧱 PeerConnection factory
-----------------------------*/
function createPeer() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) _sendSignal?.(e.candidate.toJSON());
  };

  pc.ontrack = (e) => {
    console.log(`🎧 [remote] ontrack kind=${e.track.kind}, readyState=${e.track.readyState}`);

    if (!remoteStream) remoteStream = new MediaStream();
    remoteStream.addTrack(e.track);

    if (e.track.kind === 'audio') {
      const audioEl = document.getElementById('rtc-remote-audio');
      if (audioEl && audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
        // attempt autoplay (helps on some platforms)
        audioEl.play?.().catch(()=>{});
      }
    }

    if (e.track.kind === 'video') {
      console.log('🎥 [remote] ontrack video — remote is receiving frames');
      try { UI_addVideoTile?.('remote', remoteStream, { label: 'Remote', muted: false }); } catch {}
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('🔗 PC state:', pc.connectionState);
    if (pc.connectionState === 'connected') _onConnected?.();
  };

  pc.oniceconnectionstatechange = async () => {
    console.log('🧊 ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' && _pendingICE.length) {
      for (const cand of _pendingICE.splice(0)) {
        try { await pc.addIceCandidate(cand); } catch {}
      }
    }
  };

  // ✅ perfect-negotiation-friendly
  pc.onnegotiationneeded = async () => {
    if (!pc) return;
    if (_makingOffer) return; // guard against re-entrancy
    try {
      _makingOffer = true;
      console.log('📡 negotiationneeded → creating and sending offer');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      _sendSignal?.(pc.localDescription);
    } catch (e) {
      console.warn('⚠️ negotiationneeded failed:', e);
    } finally {
      _makingOffer = false;
    }
  };

  return pc;
}

/* -----------------------------------------
   🔑 Ensure base transceivers BEFORE offers
   Order: audio(sendrecv) → video(recvonly)
------------------------------------------*/
// start__ensureBaseTransceivers_sendrecv_video
async function ensureBaseTransceivers() {
  // Already set up?
  if (_audioSender && _videoTx) return;

  // ---- AUDIO: create once, always sendrecv ----
  if (!_audioSender) {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream = localStream || new MediaStream();
    const [micTrack] = micStream.getAudioTracks();
    if (micTrack) localStream.addTrack(micTrack);

    const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    _audioSender = audioTx.sender;
    await _audioSender.replaceTrack(micTrack || null);

    // (optional) Prefer OPUS
    try {
      if (audioTx.setCodecPreferences && RTCRtpSender.getCapabilities) {
        const caps = RTCRtpSender.getCapabilities('audio');
        const opusFirst = (caps?.codecs || []).filter(c => /opus/i.test(c.mimeType));
        if (opusFirst.length) audioTx.setCodecPreferences(opusFirst);
      }
    } catch {}
  }

  // ---- VIDEO: keep m-line up, always sendrecv, we will replaceTrack(null) when "off" ----
  if (!_videoTx) {
    _videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    _videoSender = _videoTx.sender;
  }

  // Start level meter once audio is in localStream
  if (!_audioCtx && localStream) startLevelMeter(localStream);
}
// end__ensureBaseTransceivers_sendrecv_video

/* ----------------------------
   🚀 Start (offer/answer)
-----------------------------*/
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

  const polite = !!inboundOffer; // callee is polite
  pc = createPeer();

  // ✅ Create audio/video baselines once (audio=sendrecv, video=sendrecv with null track)
  await ensureBaseTransceivers();

  // start__audio_watchdog
  if (!window.__rtcAudioWatchdog) {
    window.__rtcAudioWatchdog = setInterval(async () => {
      try {
        const t = _audioSender?.track;
        if (!t || t.readyState === 'ended') {
          console.warn('🩺 Audio track ended — reacquiring mic…');
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const [micTrack] = micStream.getAudioTracks();
          if (micTrack) {
            // Preserve current mute state
            const wantEnabled = t ? t.enabled : true;
            micTrack.enabled = wantEnabled;
            await _audioSender?.replaceTrack(micTrack);
            console.log(`🎙️ Replaced mic track (preserve enabled=${wantEnabled})`);
          }
        }
      } catch {}
    }, 5000);
  }
  // end__audio_watchdog

  _pendingICE = [];

  // 🔔 signaling
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
          await Promise.allSettled([ pc.setLocalDescription({ type: 'rollback' }) ]);
        }

        await pc.setRemoteDescription(payload);
        _onConnecting?.();

        _isSettingRemoteAnswerPending = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        _isSettingRemoteAnswerPending = false;
        _sendSignal?.(pc.localDescription);

      } else if (payload?.type === 'answer') {
        if (_isSettingRemoteAnswerPending) return;
        await pc.setRemoteDescription(payload);

      } else if (payload?.candidate) {
        try { await pc.addIceCandidate(payload); }
        catch { _pendingICE.push(payload); }
      }
    } catch (err) {
      console.warn('⚠️ Signaling handler error:', err);
    }
  });

  // initial handshake
  if (inboundOffer) {
    _onConnecting?.();
    await pc.setRemoteDescription(inboundOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    _sendSignal?.(pc.localDescription);

    for (const cand of [...pendingCandidates, ..._pendingICE]) {
      try { await pc.addIceCandidate(cand); } catch {}
    }
    _pendingICE = [];
  } else {
    _onConnecting?.();
    // Optional safety: if for some reason no offer was produced, kick one off shortly.
    setTimeout(async () => {
      try {
        if (!pc) return;
        if (pc.localDescription || pc.signalingState !== 'stable' || _makingOffer) return;
        _makingOffer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        _makingOffer = false;
        _sendSignal?.(pc.localDescription);
      } catch (e) {
        _makingOffer = false;
        console.warn('⚠️ Fallback offer failed:', e);
      }
    }, 0);
  }
}

/* -------------------------------------
   🎥 Camera toggle (replaceTrack flow)
--------------------------------------*/
// start__RTC_setCameraEnabled_no_direction_flip
export async function RTC_setCameraEnabled(enabled) {
  if (!pc) throw new Error('Peer connection not ready');
  if (!_videoTx || !_videoSender) {
    console.warn('⚠️ No video transceiver/sender yet; creating one');
    _videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    _videoSender = _videoTx.sender;
  }

  if (enabled && !_cameraOn) {
    console.log('🎬 [local] Enabling camera…');

    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [newTrack] = camStream.getVideoTracks();
    if (!newTrack) throw new Error('No camera track available');

    _localVideoTrack = newTrack;

    // Attach to local preview stream
    if (!localStream) localStream = new MediaStream();
    try { localStream.getVideoTracks().forEach(t => localStream.removeTrack(t)); } catch {}
    localStream.addTrack(newTrack);

    // Attach to sender (onnegotiationneeded will fire)
    console.log('🔁 [local] replaceTrack on video sender');
    await _videoSender.replaceTrack(newTrack);

    // (Optional) Cap video bitrate to preserve audio quality
    try {
      if (_videoSender?.getParameters) {
        const p = _videoSender.getParameters();
        p.encodings = p.encodings?.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = 300_000; // ~300 kbps
        await _videoSender.setParameters(p);
      }
    } catch (e) {
      console.warn('⚠️ Could not set maxBitrate:', e);
    }

    try { UI_addVideoTile?.('local', localStream, { label: 'You', muted: true }); } catch {}

    _cameraOn = true;
    console.log('✅ [local] Camera ON (sender present:', !!_videoSender, ')');
    return true;
  }

  if (!enabled && _cameraOn) {
    console.log('🛑 [local] Disabling camera…');

    try {
      if (_videoSender) {
        console.log('🔁 [local] sender.replaceTrack(null) (keeps transceiver alive)');
        try { await _videoSender.replaceTrack(null); } catch (e) { console.warn('replaceTrack(null) failed:', e); }
      }
      try { _localVideoTrack?.stop(); } catch {}
      _localVideoTrack = null;

      try { localStream?.getVideoTracks()?.forEach(t => localStream.removeTrack(t)); } catch {}

      try { UI_removeVideoTile?.('local'); } catch {}

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
// end__RTC_setCameraEnabled_no_direction_flip

/* ----------------------------
   🎙 Mic mute/unmute
-----------------------------*/
export function RTC_setMicEnabled(enabled) {
  console.log(`🎙️ Mic track set to enabled=${enabled}`);
  try {
    const tracks = localStream?.getAudioTracks?.() || [];
    tracks.forEach(t => { t.enabled = !!enabled; });
    return tracks[0] ? tracks[0].enabled : false;
  } catch {
    return false;
  }
}


/* ----------------------------
   🧹 Teardown
-----------------------------*/
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

  try { localStream?.getTracks()?.forEach(t => t.stop()); } catch {}
  localStream = null;

  try {
    const audioEl = document.getElementById('rtc-remote-audio');
    if (audioEl) audioEl.srcObject = null;
  } catch {}

  UI_removeVideoTile?.('local');
  UI_removeVideoTile?.('remote');

  _cameraOn = false;
  _localVideoTrack = null;
  _videoSender = null;
  _videoTx = null;
  _audioSender = null;

  _makingOffer = false;
  _ignoreOffer = false;
  _isSettingRemoteAnswerPending = false;

  _started = false;
  _onTeardown?.();
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

      const enabled = stream?.getAudioTracks?.()[0]?.enabled !== false;

      _analyser.getFloatTimeDomainData(data);

      // RMS
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      let rms = Math.sqrt(sum / data.length);

      if (!enabled) rms = 0;

      const level = Math.min(1, rms * 3);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(0, 0, w, h);

      const barW = Math.max(1, Math.floor(w * level));
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(0, 0, barW, h);
    };

    draw();
  } catch {
    // ignore; meter optional
  }
}

function stopLevelMeter() {
  try { if (_rafId) cancelAnimationFrame(_rafId); } catch {}
  _rafId = null;

  try { _srcNode?.disconnect(); _analyser?.disconnect(); } catch {}
  _srcNode = null;
  _analyser = null;

  try { _audioCtx?.close(); } catch {}
  _audioCtx = null;

  try {
    const canvas = document.getElementById('rtc-level-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  } catch {}
}
