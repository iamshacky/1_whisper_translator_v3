import { UI_updateVideoLabel } from './ui.js';

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
  RTC_setVideoButton
} from './ui.js';

import {
  RTC_start,
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_setCameraEnabled,
  RTC_isCameraOn
} from './connection.js';

// Use this to label the single remote tile nicely
import { RTC_setRemoteLabel } from './connection.js';

// Signaling (broadcast)
import { RTC_setupSignaling } from './signaling.js';

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

export async function RTC__initClient(roomId) {
  try {
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: false, canEnd: false }); // enabled when ≥2 participants
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence
    } = RTC_setupSignaling(roomId);

    // Presence: enable Start when there is at least one other participant in the room
    onPresence(({ participants }) => {
      RTC_updateParticipants(participants || []);

      // Derive a friendly remote label and push it through
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

      RTC_setRemoteLabel(label);         // used by connection.js when adding the remote tile
      try { UI_updateVideoLabel('remote', label); } catch {}  // live-update if tile already exists

      if (!RTC_isStarted()) {
        const canStart = others.length >= 1;
        RTC_setButtons({ canStart, canEnd: false });
      }
    });

    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // Incoming offers/candidates when we are not started yet
    let pendingOffer = null;
    const pendingCandidates = [];

    const unsubscribeSignal = onSignal(async ({ payload, from }) => {
      try {
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
      } catch (e) {
        console.warn('[RTC] signaling error:', e);
      }
    });

    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });

      await RTC_start({
        roomId,
        sendSignal,            // ← broadcast; server fan-outs to room
        onSignal,              // ← plain subscription
        inboundOffer,
        pendingCandidates,
        onConnecting: () => {},
        onConnected: () => {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });

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
          RTC_setButtons({ canStart: true, canEnd: false }); // will be disabled by presence if alone
          RTC_setMicButton({ enabled: false, muted: false });
          RTC_setVideoButton({ enabled: false, on: false });
        }
      });
    }

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

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: false, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
  }
}
// end__bind_video_actions_and_presence_labels

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
