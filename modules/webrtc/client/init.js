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
    // Basic UI state
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    // Wire signaling
    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence
    } = RTC_setupSignaling(roomId);

    // Presence → list + nice remote label (for the single “remote” tile)
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

    // Join presence and ask for a snapshot
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // 👉 Only intercept offers when we are NOT in a call to show Accept/Decline.
    // Once the call starts, we let RTC_start's internal onSignal handler manage everything.
    let pendingOffer = null;
    const pendingCandidates = [];

    const unsubscribe = onSignal(({ payload, from }) => {
      if (!payload) return;

      if (payload.type === 'offer' && !RTC_isStarted()) {
        console.log('[RTC] OFFER received from', from, '— showing Accept prompt');
        pendingOffer = payload;

        RTC_showIncomingPrompt({
          fromId: from,
          onAccept: async () => {
            try {
              console.log('[RTC] Accept clicked — starting as polite callee');
              RTC_hideIncomingPrompt();
              await startCall({ inboundOffer: pendingOffer, pendingCandidates });
            } catch (e) {
              console.warn('[RTC] Accept failed:', e);
            } finally {
              pendingOffer = null;
              pendingCandidates.length = 0;
            }
          },
          onDecline: () => {
            console.log('[RTC] Declined incoming call from', from);
            RTC_hideIncomingPrompt();
            pendingOffer = null;
            pendingCandidates.length = 0;
          }
        });
      } else if (payload.candidate && !RTC_isStarted()) {
        // Pre-call ICE that arrives after the offer, queue it until Accept
        if (pendingOffer) pendingCandidates.push(payload);
      }
      // NOTE: When a call is running, RTC_start handles offer/answer/candidates.
    });

    // Call starter
    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });

      await RTC_start({
        roomId,
        // IMPORTANT: broadcast-only signaling (no targeting)
        sendSignal,
        onSignal,
        inboundOffer,
        pendingCandidates,
        onConnecting: () => {
          // UI already set above
        },
        onConnected: () => {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });

          // Wire the Start/Stop Video toggle
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

    // Top-level UI bindings
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
      },
      // If your UI exposes per-participant “Call” buttons, we ignore them now
      // because we’re back to broadcast-only. You can keep the button but it’ll no-op.
      onCallPeer: () => {
        alert('Direct calling is disabled in this build. Use “Start Call”.');
      }
    });

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
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
