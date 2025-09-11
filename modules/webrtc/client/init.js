// modules/webrtc/client/init.js
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
  RTC_setStartLabel,
} from './ui.js';

import {
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_startPeer,
  RTC_handleSignal,
  RTC_hangUpPeer,
  RTC_setSignalSender,
  RTC_onMeshIdle,
  RTC_isCameraOn,
  RTC_setCameraEnabled,
  RTC_setSelfId
} from './connection.js';

import { RTC_setupSignaling, probeRoomValidity } from './signaling.js';

export async function RTC__initClient(roomId) {
  console.log('[webrtc/init] RTC__initClient enter, roomId =', roomId);
  try {
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('initializing');
    // Idle baseline
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
    RTC_setStartLabel('Start Call');

    // ── Self-contained room validity check (no wsHandler changes)
    const validity = await probeRoomValidity(roomId);
    if (!validity.valid) {
      RTC_setStatus('room unavailable (QR only)');
      RTC_setButtons({ canStart: false, canEnd: false });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_setVideoButton({ enabled: false, on: false });
      RTC_setStartLabel('Start Call');
      console.warn('[webrtc/init] Room is not registered via QR; disabling call UI.');
      // Still set up listeners so if room becomes valid later (rare), page refresh will work.
    } else {
      RTC_setStatus('idle');
    }

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot,
      onPresence, onRoomInvalid, clientId
    } = RTC_setupSignaling(roomId);

    RTC_setSelfId(clientId);
    RTC_setSignalSender(sendSignal);

    const connectedPeers = new Set();
    let inCallLocal = false; // our own “we consider ourselves in the call” flag

    // NEW: presence snapshot ticker while in-call (keeps Participants fresh if events are missed)
    let presenceTicker = null;
    const startPresenceTicker = () => {
      if (presenceTicker) return;
      presenceTicker = setInterval(() => {
        try {
          requestPresenceSnapshot();
        } catch (err) {
          // ignore
        }
      }, 5000); // every 5s; cheap, avoids adding reconnect logic now
    };
    const stopPresenceTicker = () => {
      if (presenceTicker) {
        clearInterval(presenceTicker);
        presenceTicker = null;
      }
    };

    // When the MESH becomes idle (remote hung up), reset UI and our state
    RTC_onMeshIdle(() => {
      if (connectedPeers.size === 0) {
        inCallLocal = false;
        stopPresenceTicker();
        RTC_setStatus(validity.valid ? 'idle' : 'room unavailable (QR only)');
        RTC_setButtons({ canStart: validity.valid, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
        RTC_setStartLabel('Start Call');
      }
    });

    // Presence → UI update + prune + auto-dial newcomers if we’re in-call
    onPresence(({ participants }) => {
      RTC_updateParticipants(participants || []);
      window.__lastPresence = participants || [];

      const others = (participants || [])
        .map(p => p.clientId)
        .filter(id => id && id !== clientId);

      // Update Start/Join label depending on room state
      if (!inCallLocal) {
        RTC_setStartLabel(others.length > 0 ? 'Join Call' : 'Start Call');
      } else {
        RTC_setStartLabel('In Call');
      }

      // Prune peers that left
      const wanted = new Set(others);
      for (const id of Array.from(connectedPeers)) {
        if (!wanted.has(id)) {
          RTC_hangUpPeer(id);
          connectedPeers.delete(id);
        }
      }

      // Auto-dial any newcomers if we’re already in the call
      if (inCallLocal) {
        for (const id of others) {
          if (!connectedPeers.has(id)) {
            startPeer(id).catch(e => console.warn('auto startPeer failed for', id, e));
          }
        }
      }
    });

    // Identify self + snapshot
    const me = safeReadLocalUser();
    sendPresenceJoin({
      user_id: me?.user_id ?? null,
      username: me?.username || 'Someone'
    });
    requestPresenceSnapshot();

    // If server ever emits an error on this WS (e.g., room became invalid),
    // teardown locally and disable UI — self-contained and independent of other modules.
    onRoomInvalid(({ reason }) => {
      console.warn('[webrtc/init] room invalid signal via WS:', reason);
      safeTearDownUI({ banner: 'room deleted' });
    });

    // Handle signals
    onSignal(async ({ from, payload }) => {
      console.log('[webrtc/init] signal:', (payload && payload.type) || 'candidate', 'from', from);

      if (payload?.type === 'offer' && !RTC_isStarted()) {
        // Prompt user (works as Accept=Join if offers arrive any time)
        RTC_showIncomingPrompt({
          fromId: from,
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            await RTC_startPeer(from, { inboundOffer: payload });
            connectedPeers.add(from);
            inCallLocal = true;
            startPresenceTicker();
            RTC_setStatus('connecting');
            RTC_setButtons({ canStart: false, canEnd: true });
            RTC_setMicButton({ enabled: true, muted: false });
            RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
            RTC_setStartLabel('In Call');
          },
          onDecline: () => RTC_hideIncomingPrompt()
        });
      } else {
        await RTC_handleSignal({ from, payload });
        if (payload?.type === 'answer' || payload?.type === 'offer') {
          connectedPeers.add(from);
          inCallLocal = true;
          startPresenceTicker();
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
          RTC_setStartLabel('In Call');
        }
      }
    });

    // Start helper
    async function startPeer(peerId) {
      await RTC_startPeer(peerId);
      connectedPeers.add(peerId);
      inCallLocal = true;
      startPresenceTicker();
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: true, muted: false });
      RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
      RTC_setStartLabel('In Call');
    }

    // Fan-out dial
    async function startFanOut() {
      console.log('[webrtc/init] startFanOut() called');

      // Block start if room invalid; keeps module self-contained.
      const check = await probeRoomValidity(roomId);
      if (!check.valid) {
        RTC_setStatus('room unavailable (QR only)');
        RTC_setButtons({ canStart: false, canEnd: false });
        return;
      }

      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: true, muted: false });
      RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });

      requestPresenceSnapshot();

      setTimeout(() => {
        const peerIds = (window.__lastPresence || [])
          .map(p => p.clientId)
          .filter(id => id && id !== clientId);

        console.log('[webrtc/init] initial peers to dial =', peerIds);
        peerIds.forEach(id => {
          startPeer(id).catch(e => console.warn('startPeer failed for', id, e));
        });

        startPresenceTicker();
      }, 120);
    }

    // Bind UI actions
    RTC_bindActions({
      onStart: async () => { await startFanOut(); },
      onEnd: () => {
        RTC_teardownAll();
        connectedPeers.clear();
        inCallLocal = false;
        stopPresenceTicker();
        RTC_setStatus(validity.valid ? 'idle' : 'room unavailable (QR only)');
        RTC_setButtons({ canStart: validity.valid, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
        // Label will switch to Join/Start on next presence tick
      },
      onToggleMic: (currentlyMuted) => {
        const targetEnabled = currentlyMuted ? true : false;
        const isEnabledNow = RTC_setMicEnabled(targetEnabled);
        RTC_setMicButton({ enabled: true, muted: !isEnabledNow });
      }
    });

    // Wire up Start/Stop Video button
    const videoBtn = document.getElementById('rtc-video-btn');
    if (videoBtn) {
      videoBtn.onclick = async () => {
        const wantOn = videoBtn.textContent.includes('Start');
        const ok = await RTC_setCameraEnabled(wantOn);
        RTC_setVideoButton({ enabled: true, on: ok });
      };
    }

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
    RTC_setStartLabel('Start Call');
  }
}

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

function safeTearDownUI({ banner = 'idle' } = {}) {
  try { RTC_teardownAll(); } catch (err) {}
  RTC_setStatus(banner);
  RTC_setButtons({ canStart: false, canEnd: false });
  RTC_setMicButton({ enabled: false, muted: false });
  RTC_setVideoButton({ enabled: false, on: false });
  RTC_setStartLabel('Start Call');
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
  RTC_setVideoButton({ enabled: false, on: false });
  RTC_setStartLabel('Start Call');
}
