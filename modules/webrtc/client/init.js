// start__bind_video_actions_and_presence_labels
import {
  RTC_mountUI,
  RTC_setStatus,
  RTC_bindActions,
  RTC_setButtons,
  RTC_setMicButton,
  RTC_updateParticipants,
  RTC_showIncomingPrompt,
  RTC_hideIncomingPrompt,
  RTC_ensureVideoButton,
  RTC_setVideoButton,
  RTC_wireImplToggle // ⬅️ added
} from './ui.js';

import {
  RTC_start,
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_setCameraEnabled,
  RTC_isCameraOn
} from './connection.js';

// start__add_import_setRemoteLabel
import { RTC_setRemoteLabel } from './connection.js';
// end__add_import_setRemoteLabel

// start__bind_video_actions_and_presence_labels
export async function RTC__initClient(roomId) {
  const g = globalThis;
  g.__WEBRTC_INIT_FLAG__ = g.__WEBRTC_INIT_FLAG__ || { done: false };
  if (g.__WEBRTC_INIT_FLAG__.done) { console.log('ℹ️ WebRTC init already done — skipping.'); return; }
  g.__WEBRTC_INIT_FLAG__.done = true;

  try {
    // Mount UI at top of settings container and set initial control states
    RTC_mountUI();
    RTC_wireImplToggle(); // ⬅️ wire toggle in the WebRTC panel
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    // ⬇️ Dynamically import signaling so RTC_setupSignaling is definitely defined
    const { RTC_setupSignaling } = await import('./signaling.js');

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence
    } = RTC_setupSignaling(roomId);

    // Presence → UI list + derive remote label
    onPresence(({ participants }) => {
      RTC_updateParticipants(participants || []);

      const me = safeReadLocalUser();
      const myId = me?.user_id != null ? String(me.user_id) : null;
      const others = (participants || []).filter(p => !myId || String(p.user_id) !== myId);

      let label = 'Remote';
      if (others.length === 1) {
        label = (others[0].username || 'Remote').trim();
      } else if (others.length > 1) {
        const first = (others[0].username || 'Remote').trim();
        label = `${first} +${others.length - 1}`;
      }
      RTC_setRemoteLabel(label);
    });

    // Announce presence + request snapshot
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // Handle inbound offers before call is started
    let pendingOffer = null;
    const pendingCandidates = [];
    onSignal(({ payload, from }) => {
      if (payload?.type === 'offer' && !RTC_isStarted()) {
        pendingOffer = payload;
        RTC_showIncomingPrompt({
          fromId: from,
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            await startCall({ inboundOffer: pendingOffer, pendingCandidates });
            pendingOffer = null;
            pendingCandidates.length = 0;
          },
          onDecline: () => {
            RTC_hideIncomingPrompt();
            pendingOffer = null;
            pendingCandidates.length = 0;
          }
        });
      } else if (payload?.candidate && !RTC_isStarted()) {
        pendingCandidates.push(payload);
      }
    });

    // Start/End/Mic handlers
    RTC_bindActions({
      onStart: async () => { await startCall(); },
      onEnd: () => {
        RTC_teardownAll();
        RTC_setStatus('idle');
        RTC_setButtons({ canStart: true, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
      },
      onToggleMic: (currentlyMuted) => {
        const targetEnabled = currentlyMuted ? true : false;
        const isEnabledNow = RTC_setMicEnabled(targetEnabled);
        RTC_setMicButton({ enabled: true, muted: !isEnabledNow });
      }
    });

    // ---- startCall helper (enables End immediately for caller)
    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });

      await RTC_start({
        roomId,
        sendSignal,
        onSignal,
        inboundOffer,
        pendingCandidates,
        onConnecting: () => {},
        onConnected: () => {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });

          // Bind Start/Stop Video
          const vidBtn = document.getElementById('rtc-video-btn');
          if (vidBtn) {
            vidBtn.onclick = async () => {
              const next = !RTC_isCameraOn();
              try {
                await RTC_setCameraEnabled(next);
                RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
              } catch (e) {
                console.warn('Camera toggle failed:', e);
              }
            };
          }
        },
        onTeardown: () => {
          RTC_setStatus('idle');
          RTC_setButtons({ canStart: true, canEnd: false });
          RTC_setMicButton({ enabled: false, muted: false });
          RTC_setVideoButton({ enabled: false, on: false });
        }
      });
    }
    // ---- end startCall

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
  }
}
// end__bind_video_actions_and_presence_labels

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';
  await RTC__initClient(roomId);
});

export function RTC__teardown() {
  RTC_teardownAll();
  RTC_setStatus('idle');
  RTC_setButtons({ canStart: true, canEnd: false });
  RTC_setMicButton({ enabled: false, muted: false });
}
