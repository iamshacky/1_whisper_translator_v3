/* Start init.js__accept_flow_hangup_presence_cleanup */
import { RTC_setupSignaling } from './signaling.js';
import {
  RTC_start,
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_setCameraEnabled,
  RTC_connectToPeers,
  RTC_handleSignal,
  RTC_getPeerIds,
  RTC_hangupPeer
} from './connection.js';
import {
  RTC_mountUI,
  RTC_setStatus,
  RTC_bindActions,
  RTC_setButtons,
  RTC_setMicButton,
  RTC_setCameraButton,
  RTC_updateParticipants,
  RTC_showIncomingPrompt,
  RTC_hideIncomingPrompt,
  RTC_lookupName
} from './ui.js';

export async function RTC__initClient(roomId) {
  try {
    RTC_mountUI();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setCameraButton({ enabled: false, on: false });

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot, onPresence,
      clientId
    } = RTC_setupSignaling(roomId);

    // Pending offers/candidates keyed by peerId until user Accepts
    const pending = new Map(); // peerId -> { offer, candidates: [] }

    // Track current participant clientIds to detect leaves
    let lastClientIds = new Set();

    onPresence(({ participants }) => {
      RTC_updateParticipants(participants || []);
      const ids = new Set((participants || []).map(p => p.clientId).filter(Boolean));

      // Connect to new peers only after we've started
      if (RTC_isStarted()) {
        RTC_connectToPeers(Array.from(ids));
      }

      // Cleanup peers that left
      for (const existing of Array.from(lastClientIds)) {
        if (!ids.has(existing)) {
          RTC_hangupPeer(existing);
        }
      }
      lastClientIds = ids;
    });

    // Identify self + request snapshot
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // Signaling handler (supports accept flow + hangup)
    onSignal(async ({ from, payload }) => {
      if (!from || !payload) return;

      // Remote hangup (sent as {bye:true} in payload)
      if (payload.bye) {
        RTC_hangupPeer(from);
        return;
      }

      // Buffer candidates until we have accepted & set descriptions
      if (payload.candidate) {
        const ent = pending.get(from) || { offer: null, candidates: [] };
        ent.candidates.push(payload);
        pending.set(from, ent);
        return;
      }

      if (payload.type === 'offer') {
        // Show incoming prompt with username label
        const label = RTC_lookupName(from) || from.slice(0, 6);

        // If we already started, just accept immediately (no UI friction)
        if (RTC_isStarted()) {
          await RTC_handleSignal(from, payload);
          const ent = pending.get(from);
          if (ent?.candidates) {
            for (const cand of ent.candidates) await RTC_handleSignal(from, cand);
          }
          pending.delete(from);
          return;
        }

        // Not started yet → prompt
        RTC_showIncomingPrompt({
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            // Start our media first
            await startCall();
            // Apply the stored offer & candidates
            await RTC_handleSignal(from, payload);
            const ent = pending.get(from);
            if (ent?.candidates) {
              for (const cand of ent.candidates) await RTC_handleSignal(from, cand);
            }
            pending.delete(from);
          },
          onDecline: () => {
            RTC_hideIncomingPrompt();
            pending.delete(from);
            // Politely inform caller to stop trying
            sendSignal({ type: 'webrtc-signal', payload: { to: from, bye: true } }); // stays in same channel kind
          }
        });

        // Stash/replace the latest offer from that peer
        pending.set(from, { offer: payload, candidates: (pending.get(from)?.candidates || []) });
        return;
      }

      // Answers after we've sent offers (we must be started in that case)
      if (payload.type === 'answer') {
        await RTC_handleSignal(from, payload);
        return;
      }
    });

    async function startCall() {
      RTC_setButtons({ canStart: false, canEnd: false });
      RTC_setStatus('connecting');

      await RTC_start({
        meId: clientId,
        roomId,
        sendSignal,
        onConnecting: () => RTC_setStatus('connecting'),
        onConnected: () => {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setCameraButton({ enabled: true, on: false });
          // Now that we're live, proactively connect to any present peers
          RTC_connectToPeers(Array.from(lastClientIds));
        },
        onTeardown: () => {
          RTC_setStatus('idle');
          RTC_setButtons({ canStart: true, canEnd: false });
          RTC_setMicButton({ enabled: false, muted: false });
          RTC_setCameraButton({ enabled: false, on: false });
        }
      });
    }

    RTC_bindActions({
      onStart: async () => { await startCall(); },
      onEnd: () => {
        // Tell peers we're leaving so they clean up immediately
        for (const pid of RTC_getPeerIds()) {
          sendSignal({ type: 'webrtc-signal', payload: { to: pid, bye: true } });
        }
        RTC_teardownAll();
        RTC_setStatus('idle');
        RTC_setButtons({ canStart: true, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setCameraButton({ enabled: false, on: false });
      },
      onToggleMic: (isMuted) => {
        const enabled = RTC_setMicEnabled(isMuted);
        RTC_setMicButton({ enabled: true, muted: !enabled });
      },
      onToggleCamera: async (isOn) => {
        const newState = await RTC_setCameraEnabled(!isOn);
        RTC_setCameraButton({ enabled: true, on: newState });
      }
    });

    document.addEventListener('room-deleted', () => {
      RTC_teardownAll();
      RTC_setStatus('deleted');
      RTC_setButtons({ canStart: false, canEnd: false });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setCameraButton({ enabled: false, on: false });
      RTC_hideIncomingPrompt();
    });
  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setCameraButton({ enabled: false, on: false });
  }
}

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}
/* End init.js__accept_flow_hangup_presence_cleanup */

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
  RTC_setCameraButton({ enabled: false, on: false });
}
