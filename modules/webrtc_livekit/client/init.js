// modules/webrtc_livekit/client/init.js
// LiveKit client that reuses your existing WebRTC UI (vanilla-style controls).

import {
  RTC_mountUI, RTC_setStatus, RTC_bindActions, RTC_setButtons,
  RTC_setMicButton, RTC_ensureVideoButton, RTC_setVideoButton,
  RTC_updateParticipants, RTC_wireImplToggle
} from '/modules/webrtc/client/ui.js';

import { UI_addVideoTile, UI_removeVideoTile } from '/modules/webrtc/client/ui.js';
import { RTC_setupSignaling } from '/modules/webrtc/client/signaling.js';

let room = null;
let localAudioTrack = null;
let localVideoTrack = null;
let cameraOn = false;
// Presence-driven list (to match vanilla “participants in room”)
let presenceList = null;

// --- Auto-disconnect timing (tweak as you like)
const ALONE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes when alone
const ALONE_TIMEOUT_BG_MS = 60 * 1000;    // 1 minute if tab hidden & alone
const GRACE_MS = 30 * 1000;               // 30s “Still here?” grace
let __lkDisconnect = null; // set later to the real disconnectRoom()

let aloneTimer = null;
let graceTimer = null;

function getRemoteCount() {
  if (!room) return 0;
  const mp = room.remoteParticipants ?? room.participants;
  if (!mp) return 0;

  // Common cases
  if (typeof mp.size === 'number') return mp.size;
  if (typeof mp.forEach === 'function') { let c = 0; mp.forEach(() => c++); return c; }
  if (typeof mp.values === 'function') { let c = 0; for (const _ of mp.values()) c++; return c; }

  return 0;
}

function isConnected() {
  // LiveKit v2 exposes either `state` or `connectionState` depending on version
  const st = room?.state ?? room?.connectionState;
  return st === 'connected';
}

// Minimal toast/banner for the grace prompt
function showStayConnectedPrompt(onStay, onLeave) {
  let el = document.getElementById('rtc-stay-connected');
  if (el) el.remove();

  el = document.createElement('div');
  el.id = 'rtc-stay-connected';
  el.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9999;background:#fff3cd;border-left:4px solid #ffcc00;padding:10px 12px;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.12);display:flex;gap:8px;align-items:center;';
  el.innerHTML = `
    <span>You're alone in this room. Disconnecting soon…</span>
    <button id="rtc-stay">Stay connected</button>
    <button id="rtc-leave">End now</button>
  `;
  document.body.appendChild(el);

  el.querySelector('#rtc-stay').onclick = () => { try { el.remove(); } catch{} onStay?.(); };
  el.querySelector('#rtc-leave').onclick = () => { try { el.remove(); } catch{} onLeave?.(); };
}

function clearStayConnectedPrompt() {
  try { document.getElementById('rtc-stay-connected')?.remove(); } catch {}
}

function scheduleAloneCheck() {
  clearTimeout(aloneTimer);
  clearTimeout(graceTimer);
  clearStayConnectedPrompt();

  if (!isConnected()) return;

  const alone = getRemoteCount() === 0;
  if (!alone) return;

  const ms = document.hidden ? ALONE_TIMEOUT_BG_MS : ALONE_TIMEOUT_MS;

  aloneTimer = setTimeout(() => {
    showStayConnectedPrompt(
      // Stay → just reset the timer window
      () => { scheduleAloneCheck(); },

      // Leave now
      async () => {
        cancelAloneCheck();
        try { await __lkDisconnect?.(); } catch {}
      }
    );

    graceTimer = setTimeout(async () => {
      cancelAloneCheck();
      try { await __lkDisconnect?.(); } catch {}
    }, GRACE_MS);
  }, ms);
}

function cancelAloneCheck() {
  clearTimeout(aloneTimer);
  clearTimeout(graceTimer);
  clearStayConnectedPrompt();
}

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

/** One-time UI to satisfy autoplay policies if needed (only shown on play() rejection) */
function ensureAudioUnlockUI() {
  if (document.getElementById('lk-audio-unlock')) return;
  const host = document.getElementById('webrtc-area') || document.body;
  const box = document.createElement('div');
  box.id = 'lk-audio-unlock';
  box.style.margin = '8px 0';
  box.style.background = '#fff8e1';
  box.style.borderLeft = '4px solid #ffcc00';
  box.style.padding = '8px';
  box.style.borderRadius = '4px';
  box.innerHTML = `
    <button id="lk-resume-audio">Enable sound</button>
    <span style="margin-left:8px;color:#555;">(click once if your browser blocked autoplay)</span>
  `;
  host.insertBefore(box, host.firstChild || null);
  document.getElementById('lk-resume-audio').onclick = async () => {
    try { await room?.startAudio?.(); } catch {}
    try { box.remove(); } catch {}
  };
}

/* ---------- Helpers (defensive across LK versions) ---------- */
function collectRemoteParticipants() {
  if (!room) return [];
  const mp = (room.remoteParticipants ?? room.participants);
  const out = [];
  if (!mp) return out;
  if (typeof mp.forEach === 'function') {
    mp.forEach(p => out.push(p));
  } else if (typeof mp.values === 'function') {
    for (const p of mp.values()) out.push(p);
  }
  return out;
}

function attachRemoteVideo(participant, videoTrack /* RemoteVideoTrack */) {
  if (!videoTrack?.mediaStreamTrack) return;
  const ms = new MediaStream([ videoTrack.mediaStreamTrack ]);
  UI_addVideoTile(participant?.identity || 'remote', ms, {
    label: participant?.name || 'Remote',
    muted: true, // keep <video> muted; audio is handled by #rtc-remote-audio
  });
}

function attachRemoteAudio(audioTrack /* RemoteAudioTrack */) {
  const audioEl = document.getElementById('rtc-remote-audio');
  if (!audioEl) return;

  try {
    // Let LiveKit bind to a real element (best AEC)
    audioTrack.attach(audioEl);
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.muted = false;
    if (audioEl.volume === 0) audioEl.volume = 1;
    audioEl.play?.().catch(() => { ensureAudioUnlockUI(); });
  } catch {
    // Fallback to srcObject
    try {
      audioEl.srcObject = new MediaStream([ audioTrack.mediaStreamTrack ]);
      audioEl.play?.().catch(() => { ensureAudioUnlockUI(); });
    } catch {}
  }
}

function detachRemoteAudio() {
  const audioEl = document.getElementById('rtc-remote-audio');
  if (!audioEl) return;
  try {
    const rem = collectRemoteParticipants();
    rem.forEach(p => {
      p.audioTracks?.forEach?.(pub => pub?.track?.detach?.(audioEl));
    });
  } catch {}
  try { audioEl.pause?.(); } catch {}
  try { audioEl.srcObject = null; } catch {}
}

/** Presence-first participants: match vanilla behavior */
function updateParticipantsUI() {
  if (Array.isArray(presenceList)) {
    RTC_updateParticipants(presenceList);
    return;
  }
  // Fallback to LiveKit participant list if presence isn’t available
  const parts = [];
  const me = safeReadLocalUser();
  parts.push({ user_id: me?.user_id ?? null, username: me?.username || 'You' });
  const remotes = collectRemoteParticipants();
  remotes.forEach(p => parts.push({ user_id: p?.identity || null, username: p?.name || 'Remote' }));
  RTC_updateParticipants(parts);
}

export async function RTC__initClientFromSelector() {
  // Mount shared UI
  RTC_mountUI();
  RTC_wireImplToggle();
  RTC_ensureVideoButton();
  RTC_setStatus('idle');
  RTC_setButtons({ canStart: true, canEnd: false });
  RTC_setMicButton({ enabled: false, muted: false });
  RTC_setVideoButton({ enabled: false, on: false });

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';

  // Presence wiring (so “Participants” shows people in the room even before LiveKit connect)
  try {
    const { sendPresenceJoin, requestPresenceSnapshot, onPresence } = RTC_setupSignaling(roomId);
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();
    onPresence(({ participants }) => {
      presenceList = participants || [];
      RTC_updateParticipants(presenceList);
    });
  } catch (e) {
    console.warn('⚠️ Presence wiring skipped:', e);
  }

  // Load LiveKit client
  let Livekit = null;
  try {
    Livekit = await import('livekit-client'); // via import map
  } catch {
    const candidates = [
      '/node_modules/livekit-client/dist/livekit-client.esm.mjs',
      '/node_modules/livekit-client/dist/livekit-client.esm.js',
      '/node_modules/livekit-client/dist/index.js',
      '/node_modules/livekit-client/dist/esm/index.js'
    ];
    for (const url of candidates) {
      try { Livekit = await import(url); console.log('🟩 livekit-client loaded from', url); break; }
      catch {}
    }
    if (!Livekit) return; // leave UI idle if still unavailable
  }

  const { RoomEvent, createLocalTracks, VideoPresets } = Livekit;

  async function connectRoom() {
    // Build identity & request token
    const me = safeReadLocalUser();
    const name = me?.username || 'Someone';
    const base = me?.user_id ? String(me.user_id) : 'anon';
    const identity = `${base}-${tabSuffix()}`;
    console.log('🔐 LiveKit identity/name:', { identity, name });

    const tRes = await fetch('/api/webrtc_livekit/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomId, identity, name })
    });
    if (!tRes.ok) {
      const text = await tRes.text().catch(()=> '');
      console.warn('❌ Token endpoint failed', tRes.status, text);
      throw new Error('Token request failed');
    }
    const { token, url } = await tRes.json();
    console.log('🧾 Token len/preview:', token?.length, token?.slice?.(0, 20) + '…', ' url:', url);

    room = new Livekit.Room();

    // ---------- Events ----------
    // ---------- Events (paste this whole block) ----------
    room
      // Log-only; concrete UI state is handled by Connected/Disconnected below
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('🔄 LK state →', state);
        if (state === 'connected') {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: cameraOn });
          updateParticipantsUI();
        } else if (state === 'disconnected') {
          cancelAloneCheck();  // ← add this
          uiResetToIdle();     // ← and this
        }
      })

      // ✅ Connected → set UI and start “alone” timer (will no-op if not alone)
      .on(RoomEvent.Connected, () => {
        console.log('🟢 LK Connected');
        RTC_setStatus('connected');
        RTC_setButtons({ canStart: false, canEnd: true });
        RTC_setMicButton({ enabled: true, muted: false });
        RTC_setVideoButton({ enabled: true, on: cameraOn });
        updateParticipantsUI();
        scheduleAloneCheck();
      })

      // ✅ Disconnected → UI idle and clear timers/prompts
      .on(RoomEvent.Disconnected, () => {
        console.log('🔴 LK Disconnected');
        RTC_setStatus('idle');
        cancelAloneCheck();
      })

      .on(RoomEvent.SignalConnected, () => { console.log('📶 signal connected'); })

      // Any remote participant joins → no longer alone
      .on(RoomEvent.ParticipantConnected, () => {
        updateParticipantsUI();
        cancelAloneCheck();
      })

      // A remote participant leaves → might be alone now
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        try { UI_removeVideoTile(p?.identity || 'remote'); } catch {}
        updateParticipantsUI();
        scheduleAloneCheck();
      })

      // Media activity implies not idle/alone
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        try {
          if (track?.kind === 'video') {
            console.log('🎥 track subscribed from:', participant?.identity, pub?.source, pub?.trackSid);
            attachRemoteVideo(participant, track);
          } else if (track?.kind === 'audio') {
            console.log('🔊 audio track subscribed from:', participant?.identity);
            attachRemoteAudio(track);
          }
          cancelAloneCheck(); // not “idle alone”
        } catch (e) {
          console.warn('⚠️ TrackSubscribed handler error:', e);
        }
      })

      // Loss of media could drop us to “alone”
      .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        try {
          if (track?.kind === 'video') {
            console.log('🧹 video track unsubscribed from:', participant?.identity, pub?.trackSid);
            // (tile cleanup largely handled elsewhere in 1:1)
          } else if (track?.kind === 'audio') {
            console.log('🧹 audio track unsubscribed from:', participant?.identity);
            detachRemoteAudio();
          }
        } catch {}
        scheduleAloneCheck();
      })

      .on(RoomEvent.Reconnecting, () => console.log('🟡 reconnecting…'))
      .on(RoomEvent.Reconnected,  () => console.log('🟢 reconnected'));

    // Adjust the idle timer window when the tab visibility changes while alone
    document.addEventListener('visibilitychange', () => {
      if (!isConnected()) return;
      if (getRemoteCount() === 0) {
        scheduleAloneCheck();   // recompute window when tab hides/shows
      }
    });

    RTC_setStatus('connecting');

    try {
      await room.connect(url, token);
      console.log('✅ room.connect resolved');

      // Publish mic by default
      const micTracks = await createLocalTracks({ audio: true });
      localAudioTrack = micTracks.find(t => t.kind === 'audio') || null;
      if (localAudioTrack) {
        await room.localParticipant.publishTrack(localAudioTrack);
        console.log('🎙️ mic published');
      }

      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: true, muted: false });
      RTC_setVideoButton({ enabled: true, on: false });

      updateParticipantsUI();
    } catch (e) {
      console.warn('❌ room.connect failed:', e);
      throw e;
    }
  }

  function uiResetToIdle() {
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
  }

  async function disconnectRoom() {
    cancelAloneCheck();          // ← stop any pending idle timers/prompts
    try {
      if (localVideoTrack) { try { await room?.localParticipant?.unpublishTrack?.(localVideoTrack); } catch {} localVideoTrack.stop?.(); localVideoTrack = null; }
      if (localAudioTrack) { try { await room?.localParticipant?.unpublishTrack?.(localAudioTrack); } catch {} localAudioTrack.stop?.(); localAudioTrack = null; }
      detachRemoteAudio();
      await room?.disconnect();
    } catch {}
    room = null;
    cameraOn = false;

    UI_removeVideoTile('local');
    // Sweep leftover remote tiles
    const grid = document.getElementById('rtc-video-grid');
    grid?.querySelectorAll('.rtc-tile')?.forEach(el => el.id.endsWith('-local') ? null : el.remove());

    uiResetToIdle();             // ← always restore the button states/colors
    updateParticipantsUI();      // ← shows presence-only if you have it wired
  }

  __lkDisconnect = disconnectRoom;

  async function setMicEnabled(enabled) {
    if (!room) return false;

    // Prefer the high-level API if present (v2+)
    try {
      if (room.localParticipant?.setMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        return enabled;
      }
    } catch {}

    // Fallbacks
    try {
      if (localAudioTrack?.mediaStreamTrack) {
        localAudioTrack.mediaStreamTrack.enabled = !!enabled;
        return !!enabled;
      }
    } catch {}

    return false;
  }

  async function setCameraEnabled(enabled) {
    if (!room) return false;

    if (enabled && !cameraOn) {
      const tracks = await Livekit.createLocalTracks({ video: { resolution: VideoPresets.h540.resolution } });
      localVideoTrack = tracks.find(t => t.kind === 'video') || null;
      if (!localVideoTrack) return false;

      await room.localParticipant.publishTrack(localVideoTrack);
      const stream = new MediaStream([ localVideoTrack.mediaStreamTrack ]);
      UI_addVideoTile('local', stream, { label: 'You', muted: true });
      cameraOn = true;
      return true;
    }

    if (!enabled && cameraOn) {
      try { await room.localParticipant.unpublishTrack(localVideoTrack); } catch {}
      try { localVideoTrack.stop(); } catch {}
      localVideoTrack = null;
      UI_removeVideoTile('local');
      cameraOn = false;
      return false;
    }

    return cameraOn;
  }

  function tabSuffix() {
    try {
      let id = sessionStorage.getItem('lk-client-id');
      if (!id) {
        id = crypto.randomUUID().slice(0, 8);
        sessionStorage.setItem('lk-client-id', id);
      }
      return id;
    } catch {
      return crypto.randomUUID().slice(0, 8);
    }
  }

  // Bind buttons
  RTC_bindActions({
    onStart: async () => {
      try {
        await connectRoom();
      } catch {
        RTC_setStatus('error');
        RTC_setButtons({ canStart: true, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
      } finally {
        const startBtn = document.getElementById('rtc-start-btn');
        if (startBtn) startBtn.disabled = false;
      }
    },
    onEnd: async () => {
      await disconnectRoom();
      RTC_setStatus('idle');
      RTC_setButtons({ canStart: true, canEnd: false });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });
    },
    onToggleMic: async (currentlyMuted) => {
      // if currently muted → enable, else disable
      const targetEnabled = !!currentlyMuted;
      const ok = await setMicEnabled(targetEnabled);
      RTC_setMicButton({ enabled: true, muted: !ok });
    }
  });

  // Video button click (only when connected)
  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('#rtc-video-btn');
    if (!btn || !room) return;
    const next = !cameraOn;
    try {
      await setCameraEnabled(next);
      RTC_setVideoButton({ enabled: true, on: cameraOn });
    } catch {}
  });
}
