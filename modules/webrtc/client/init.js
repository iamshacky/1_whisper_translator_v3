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

// start__add_import_setRemoteLabel
import { RTC_setRemoteLabel } from './connection.js';
// end__add_import_setRemoteLabel


// ✅ Add this import for signaling
import { RTC_setupSignaling } from './signaling.js';
// end__fix_import_signaling

/* Start__target_peer_selection_and_filtered_signaling */

let __presence = { participants: [] };
let __targetClientId = null;
let __targetUsername = null;

function __me() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}
function __others() {
  const me = __me();
  const myId = me?.user_id != null ? String(me.user_id) : null;
  return (Array.isArray(__presence.participants) ? __presence.participants : [])
    .filter(p => !myId || String(p.user_id) !== myId);
}
function __findByClientId(id) {
  return (__presence.participants || []).find(p => p.clientId === id) || null;
}
function __ensureTargetForOneOther() {
  const others = __others();
  if (others.length === 1) {
    __targetClientId = others[0].clientId || null;
    __targetUsername = (others[0].username || 'Remote').trim();
  }
}

export async function RTC__initClient(roomId) {
  try {
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: false, canEnd: false }); // gated by selection/presence
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence, clientId
    } = RTC_setupSignaling(roomId);

    // Handle target selection from Participants list
    document.addEventListener('rtc-select-target', (e) => {
      const { clientId: targetId, username } = e.detail || {};
      __targetClientId = targetId || null;
      __targetUsername = username || 'Remote';
      RTC_setRemoteLabel(__targetUsername);
      // Enable start if not already in a call
      if (!RTC_isStarted() && __targetClientId) {
        RTC_setStatus(`selected: ${__targetUsername}`);
        RTC_setButtons({ canStart: true, canEnd: false });
      }
    });

    // Presence → update list and auto-enable Start if exactly one other
    onPresence(({ participants }) => {
      __presence.participants = participants || [];
      RTC_updateParticipants(__presence.participants);

      // Auto-target when exactly one other is present
      if (!RTC_isStarted() && !__targetClientId) {
        __ensureTargetForOneOther();
        if (__targetClientId) {
          RTC_setRemoteLabel(__targetUsername);
          RTC_setStatus(`ready to call ${__targetUsername}`);
          RTC_setButtons({ canStart: true, canEnd: false });
        }
      }

      // If the current target left, clear selection
      if (__targetClientId && !__findByClientId(__targetClientId)) {
        __targetClientId = null;
        __targetUsername = null;
        RTC_setStatus('target left — select someone');
        RTC_setButtons({ canStart: false, canEnd: false });
        if (!RTC_isStarted()) RTC_setVideoButton({ enabled: false, on: false });
      }
    });

    const me = __me();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // Wrap signaling: only process offers/candidates for me; if offer arrives with no target set, adopt caller.
    const filteredOnSignal = (fn) => onSignal(({ payload, from }) => {
      // 🔔 Incoming targeted offer (callee path: we are NOT started yet)
      if (payload?.type === 'offer' && !RTC_isStarted()) {
        console.log('[RTC] OFFER received from', from, '— showing Accept prompt');
        let pendingOffer = payload;
        const pendingCandidates = [];

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

        const unsub = onSignal(({ payload: p2 }) => {
          if (p2?.candidate && pendingOffer) pendingCandidates.push(p2);
        });
        // Small safety: once we Accept/Decline, the pendingOffer is nulled and the
        return;
      }

      // (keep your other branches: 'answer', 'candidate' when RTC_isStarted(), etc.)
    });

    let pendingOffer = null;
    const pendingCandidates = [];
    filteredOnSignal(({ payload, from }) => {
      if (payload?.type === 'offer' && !RTC_isStarted()) {
        if (from !== __targetClientId) return;
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
        if (from === __targetClientId) pendingCandidates.push(payload);
      }
    });

    // Send signaling addressed to the selected peer
    const sendSignalToTarget = (payload) => {
      // If exactly one other is present but target hasn't been set, set it now.
      if (!__targetClientId) __ensureTargetForOneOther();

      if (__targetClientId) {
        // 🧭 DEBUG: targeted send
        console.log('[RTC] sendSignalToTarget → targeted', { to: __targetClientId, type: payload?.type });

        // 🎯 targeted signaling (tunneled as __to inside payload by signaling.js)
        sendSignal(payload, __targetClientId);
      } else {
        // 🧭 DEBUG: first-offer broadcast (no target yet)
        console.log('[RTC] sendSignalToTarget → broadcast first offer', { type: payload?.type });
        
        // 📣 first-offer broadcast (callee will adopt)
        sendSignal(payload); // no `to` → no __to injected
      }
    };

    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      if (!__targetClientId) {
        alert('Select a participant to call from the list.');
        return;
      }
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });

      await RTC_start({
        roomId,
        sendSignal: sendSignalToTarget, // 🎯 address only the target
        onSignal: filteredOnSignal,
        inboundOffer,
        pendingCandidates,
        onConnecting: () => {},
        onConnected: () => {
          RTC_setStatus(`connected with ${__targetUsername || 'peer'}`);
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
          // Keep selection so you can call again quickly
          RTC_setButtons({ canStart: !!__targetClientId, canEnd: false });
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
        // optional: keep current target or clear it; I’ll leave as-is
      },
      onToggleMic: (currentlyMuted) => {
        const targetEnabled = currentlyMuted ? true : false;
        const isEnabledNow = RTC_setMicEnabled(targetEnabled);
        RTC_setMicButton({ enabled: true, muted: !isEnabledNow });
      },

      // ⬇️ NEW: targeted call when you click "Call" next to a participant
      onCallPeer: ({ clientId, username }) => {
        if (!clientId) return;

        // If already on a call, avoid auto-switching to prevent surprises.
        if (RTC_isStarted()) {
          alert('Already on a call. End it first, then call someone else.');
          return;
        }

        __targetClientId = clientId;
        __targetUsername = (username || 'Remote').trim();
        RTC_setRemoteLabel(__targetUsername);
        console.log('[RTC] onCallPeer → target set', { clientId, username: __targetUsername });

        // Now start a targeted call (first offer will be addressed to __targetClientId)
        startCall();
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
/* End__target_peer_selection_and_filtered_signaling */

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
