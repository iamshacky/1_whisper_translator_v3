// start__bind_video_actions_and_presence_labels
import { UI_updateVideoLabel } from './ui.js';

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

// Signaling (has targeted send with __to and receive-side filter)
import { RTC_setupSignaling } from './signaling.js';

/* -----------------------------
   🔒 Active peer + presence
------------------------------*/
let __presence = { participants: [] };   // last presence snapshot
let __activePeerId = null;               // who I'm currently talking to (clientId)
let __activePeerName = null;             // label for the remote tile

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

/* -----------------------------
   🧰 Helper: derive label
------------------------------*/
function deriveRemoteLabel(participants) {
  const me = safeReadLocalUser();
  const myId = me?.user_id != null ? String(me.user_id) : null;
  const others = (participants || []).filter(p => !myId || String(p.user_id) !== myId);

  if (others.length === 0) return 'Remote';
  if (others.length === 1) return (others[0].username || 'Remote').trim();

  const first = (others[0].username || 'Remote').trim();
  return `${first} +${others.length - 1}`;
}

/* -----------------------------
   🧰 Filter incoming signals
   - Adopt caller on first inbound offer if idle
   - Ignore messages not from active peer
------------------------------*/
function makeFilteredOnSignal(onSignal, startCallRef) {
  return (innerHandler) =>
    onSignal(({ payload, from }) => {
      // If we already have a partner, ignore anyone else
      if (__activePeerId && from !== __activePeerId) return;

      // No partner yet & not started → adopt caller on inbound offer
      if (!__activePeerId && !RTC_isStarted() && payload?.type === 'offer') {
        __activePeerId = from;

        // Best-effort friendly name
        const p = (__presence.participants || []).find(pp => pp.clientId === from);
        __activePeerName = (p?.username || 'Remote').trim();
        RTC_setRemoteLabel(__activePeerName);

        let pendingOffer = payload;
        const pendingCandidates = [];

        RTC_showIncomingPrompt({
          fromId: from,
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            try {
              await startCallRef({ inboundOffer: pendingOffer, pendingCandidates });
            } finally {
              pendingOffer = null;
              pendingCandidates.length = 0;
            }
          },
          onDecline: () => {
            RTC_hideIncomingPrompt();
            // Clear partner so we can adopt someone else later.
            __activePeerId = null;
            __activePeerName = null;
            pendingOffer = null;
            pendingCandidates.length = 0;
          }
        });

        // While waiting for accept, collect ICE candidates ONLY from this same sender
        const unsub = onSignal(({ payload: p2, from: f2 }) => {
          if (f2 !== from) return;
          if (p2?.candidate && pendingOffer) pendingCandidates.push(p2);
        });

        return; // don't forward this initial offer to connection.js
      }

      // If still no partner (e.g., ICE prior to adoption), ignore
      if (!__activePeerId) return;

      // Forward allowed messages to the underlying connection logic
      innerHandler?.({ payload, from });
    });
}

export async function RTC__initClient(roomId) {
  try {
    /* UI bootstrap */
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: false, canEnd: false }); // enabled when ≥2 participants
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    /* Signaling */
    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence
    } = RTC_setupSignaling(roomId);

    /* Presence: render + enable/disable Start + keep a nice label */
    onPresence(({ participants }) => {
      __presence.participants = participants || [];
      RTC_updateParticipants(__presence.participants);

      const label = deriveRemoteLabel(__presence.participants);
      RTC_setRemoteLabel(label);
      try { UI_updateVideoLabel('remote', label); } catch {}

      if (!RTC_isStarted()) {
        const me = safeReadLocalUser();
        const myId = me?.user_id != null ? String(me.user_id) : null;
        const others = (__presence.participants || []).filter(p => !myId || String(p.user_id) !== myId);
        RTC_setButtons({ canStart: others.length >= 1, canEnd: false });
      }
    });

    /* Identify myself for presence */
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    /* 🎯 Targeted signaling: always send only to active peer */
    const sendSignalToActive = (payload) => {
      if (!__activePeerId) {
        console.warn('[RTC] No active peer; dropping signal', payload?.type);
        return;
      }
      // signaling.js will embed __to automatically when `to` is provided
      sendSignal(payload, __activePeerId);
    };

    /* Start call (caller or callee path) */
    const startCall = async ({ inboundOffer = null, pendingCandidates = [] } = {}) => {
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });

      const filteredOnSignal = makeFilteredOnSignal(onSignal, startCall);

      await RTC_start({
        roomId,
        sendSignal: sendSignalToActive,   // 🎯 ONLY to the active peer
        onSignal: filteredOnSignal,       // 🚦 ignore non-partner traffic
        inboundOffer,
        pendingCandidates,
        onConnecting: () => {},
        onConnected: () => {
          RTC_setStatus(`connected with ${__activePeerName || 'peer'}`);
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
          // Keep selection so caller can re-dial quickly (optional to clear)
          RTC_setButtons({ canStart: !!__activePeerId, canEnd: false });
          RTC_setMicButton({ enabled: false, muted: false });
          RTC_setVideoButton({ enabled: false, on: false });
        }
      });
    };

    /* Top-level button wiring */
    RTC_bindActions({
      onStart: async () => {
        if (RTC_isStarted()) return;

        // Pick one other deterministically (first in presence list)
        const me = safeReadLocalUser();
        const myId = me?.user_id != null ? String(me.user_id) : null;
        const others = (__presence.participants || []).filter(p => !myId || String(p.user_id) !== myId);

        if (!others.length) {
          alert('No one else is here to call.');
          return;
        }

        const chosen = others[0];
        __activePeerId = chosen.clientId || null;
        __activePeerName = (chosen.username || 'Remote').trim();
        RTC_setRemoteLabel(__activePeerName);

        await startCall();
      },

      onEnd: () => {
        RTC_teardownAll();
        RTC_setStatus('idle');
        // You can clear the active peer if you prefer:
        // __activePeerId = null;
        // __activePeerName = null;
        RTC_setButtons({ canStart: !!__activePeerId, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
      },

      onToggleMic: (currentlyMuted) => {
        const wantEnabled = currentlyMuted ? true : false;
        const nowEnabled = RTC_setMicEnabled(wantEnabled);
        RTC_setMicButton({ enabled: true, muted: !nowEnabled });
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
