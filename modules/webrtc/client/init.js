// modules/webrtc/client/init.js

import { UI_updateVideoLabel } from './ui.js';

// UI helpers
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

// Connection control
import {
  RTC_start,
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_setCameraEnabled,
  RTC_isCameraOn
} from './connection.js';

// For labeling the single remote tile nicely
import { RTC_setRemoteLabel } from './connection.js';

// Signaling (broadcast). We’ll piggyback a “call-active” / “call-ended” flag.
import { RTC_setupSignaling } from './signaling.js';

// -----------------------------
// Local helpers / room state
// -----------------------------
let __presence = { participants: [] };
let __callActive = false;         // soft room-wide flag
let __clientId = null;            // my signaling id

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

function computeOthers(list) {
  const me = safeReadLocalUser();
  const myId = me?.user_id != null ? String(me.user_id) : null;
  return (Array.isArray(list) ? list : []).filter(p => !myId || String(p.user_id) !== myId);
}

function applyRemoteLabelFromPresence(list) {
  const others = computeOthers(list);
  let label = 'Remote';
  if (others.length === 1) {
    label = (others[0].username || 'Remote').trim();
  } else if (others.length > 1) {
    const first = (others[0].username || 'Remote').trim();
    label = `${first} +${others.length - 1}`;
  }
  RTC_setRemoteLabel(label);
  try { UI_updateVideoLabel('remote', label); } catch {}
}

function applyButtonsFromPresence() {
  // Start enabled only if: no active call, not already started, and there is ≥1 other
  if (RTC_isStarted()) {
    RTC_setButtons({ canStart: false, canEnd: true });
    return;
  }
  if (__callActive) {
    RTC_setButtons({ canStart: false, canEnd: false });
    return;
  }
  const others = computeOthers(__presence.participants);
  RTC_setButtons({ canStart: others.length >= 1, canEnd: false });
}

// -----------------------------
// Main init
// -----------------------------
export async function RTC__initClient(roomId) {
  try {
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: false, canEnd: false }); // presence will enable
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence, clientId
    } = RTC_setupSignaling(roomId);

    __clientId = clientId;

    // Presence updates drive the participant list, labels, and the Start button
    onPresence(({ participants }) => {
      __presence.participants = participants || [];
      RTC_updateParticipants(__presence.participants);
      applyRemoteLabelFromPresence(__presence.participants);
      applyButtonsFromPresence();
    });

    // Identify in presence
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // -----------------------------
    // Signaling pre-call handling
    //  - accept only when idle AND no call is active
    //  - listen to soft call flags
    // -----------------------------
    let pendingOffer = null;
    const pendingCandidates = [];

    onSignal(async ({ payload, from }) => {
      try {
        // Soft room-wide call flags (broadcast)
        if (payload?.type === 'call-active') {
          __callActive = true;
          if (!RTC_isStarted()) {
            RTC_setStatus('busy');
            RTC_setButtons({ canStart: false, canEnd: false });
          }
          return;
        }
        if (payload?.type === 'call-ended') {
          __callActive = false;
          if (!RTC_isStarted()) {
            RTC_setStatus('idle');
            applyButtonsFromPresence();
          }
          return;
        }

        // Don’t intercept offer/candidate if we’re already in a call
        if (RTC_isStarted()) return;

        // Ignore offers if the room is marked busy
        if (__callActive) return;

        // Standard pre-call intake
        if (payload?.type === 'offer') {
          pendingOffer = payload;
          RTC_showIncomingPrompt({
            fromId: from,
            onAccept: async () => {
              try {
                // We’re claiming the room; broadcast “active” so other idle peers don’t pop prompts
                __callActive = true;
                sendSignal({ type: 'call-active', by: __clientId });

                RTC_hideIncomingPrompt();
                await startCall({ inboundOffer: pendingOffer, pendingCandidates });
              } catch (e) {
                console.warn('[RTC] Accept failed:', e);
                __callActive = false;
                sendSignal({ type: 'call-ended', by: __clientId });
              } finally {
                pendingOffer = null;
                pendingCandidates.length = 0;
              }
            },
            onDecline: () => {
              RTC_hideIncomingPrompt();
              pendingOffer = null;
              pendingCandidates.length = 0;
              // remain idle; do not set flags
            }
          });
          return;
        }

        if (payload?.candidate && pendingOffer) {
          pendingCandidates.push(payload);
        }
      } catch (e) {
        console.warn('[RTC] signaling error:', e);
      }
    });

    // -----------------------------
    // Start/End/Mic actions
    // -----------------------------
    RTC_bindActions({
      onStart: async () => {
        if (RTC_isStarted() || __callActive) return;

        const others = computeOthers(__presence.participants);
        if (!others.length) {
          alert('No one else is here to call.');
          return;
        }

        // Claim room and broadcast “active” so late joiners disable Start + no prompts
        __callActive = true;
        sendSignal({ type: 'call-active', by: __clientId });

        await startCall(); // outbound (no inboundOffer)
      },

      onEnd: () => {
        RTC_teardownAll();
        __callActive = false;
        sendSignal({ type: 'call-ended', by: __clientId });

        RTC_setStatus('idle');
        applyButtonsFromPresence();
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
      },

      onToggleMic: (currentlyMuted) => {
        const wantEnabled = currentlyMuted ? true : false;
        const nowEnabled = RTC_setMicEnabled(wantEnabled);
        RTC_setMicButton({ enabled: true, muted: !nowEnabled });
      }
    });

    // -----------------------------
    // Call bootstrapper
    // -----------------------------
    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });

      await RTC_start({
        roomId,
        sendSignal,            // broadcast; your server fans out to room
        onSignal,              // plain subscription; connection.js handles offer/answer/cand during call
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
          // Connection ended (remote hangup or local)
          __callActive = false;
          sendSignal({ type: 'call-ended', by: __clientId });

          RTC_setStatus('idle');
          applyButtonsFromPresence();
          RTC_setMicButton({ enabled: false, muted: false });
          RTC_setVideoButton({ enabled: false, on: false });
        }
      });
    }

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: false, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
  }
}

// Boot
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';
  await RTC__initClient(roomId);
});

// For external teardown
export function RTC__teardown() {
  RTC_teardownAll();
  RTC_setStatus('idle');
  RTC_setButtons({ canStart: true, canEnd: false });
  RTC_setMicButton({ enabled: false, muted: false });
}
