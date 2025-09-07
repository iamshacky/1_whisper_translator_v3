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
  RTC_setVideoButton
} from './ui.js';

import {
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_startPeer,
  RTC_handleSignal,
  RTC_hangUpPeer,
  RTC_setSignalSender,
  RTC_setCameraEnabled,
  RTC_isCameraOn
} from './connection.js';

import { RTC_setupSignaling } from './signaling.js';

export async function RTC__initClient(roomId) {
  console.log('[webrtc/init] RTC__initClient enter, roomId =', roomId);
  try {
    RTC_mountUI();
    RTC_ensureVideoButton();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });

    const startBtn = document.getElementById('rtc-start-btn');
    if (startBtn) startBtn.disabled = false;

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot,
      onPresence, clientId
    } = RTC_setupSignaling(roomId);

    RTC_setSignalSender(sendSignal);

    const connectedPeers = new Set();

    // Presence → UI update + prune
    onPresence(({ participants }) => {
      RTC_updateParticipants(participants || []);
      window.__lastPresence = participants || [];

      const wanted = new Set((participants || [])
        .map(p => p.clientId)
        .filter(id => id && id !== clientId));

      for (const id of Array.from(connectedPeers)) {
        if (!wanted.has(id)) {
          RTC_hangUpPeer(id);
          connectedPeers.delete(id);
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

    // Handle signals
    onSignal(async ({ from, payload }) => {
      const typ = payload?.type || (payload?.candidate ? 'candidate' : 'unknown');
      console.log('[webrtc/init] signal:', typ, 'from', from);
      if (!payload) return;

      if (payload?.type === 'offer' && !RTC_isStarted()) {
        // Prompt user
        RTC_showIncomingPrompt({
          fromId: from,
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            await RTC_startPeer(from, { inboundOffer: payload });
            connectedPeers.add(from);
            RTC_setStatus('connecting');
            RTC_setButtons({ canStart: false, canEnd: true });
            // Enable mic & video buttons now that a call is in progress
            RTC_setMicButton({ enabled: true, muted: false });
            RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
            wireVideoButton(); // ensure handler is present
          },
          onDecline: () => RTC_hideIncomingPrompt()
        });
      } else {
        await RTC_handleSignal({ from, payload });
        if (payload?.type === 'answer' || payload?.type === 'offer') {
          connectedPeers.add(from);
          // Enable mic & video buttons on first SDP exchange
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
          wireVideoButton();
        }
      }
    });

    // Start helper
    async function startPeer(peerId) {
      await RTC_startPeer(peerId);
      connectedPeers.add(peerId);
      RTC_setStatus('connecting');
    }

    // Fan-out dial
    async function startFanOut() {
      console.log('[webrtc/init] startFanOut() called');
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });

      // ✅ Enable mic/video controls as a call starts
      RTC_setMicButton({ enabled: true, muted: false });
      RTC_setVideoButton({ enabled: true, on: RTC_isCameraOn() });
      wireVideoButton();

      requestPresenceSnapshot();

      setTimeout(() => {
        const peerIds = (window.__lastPresence || [])
          .map(p => p.clientId)
          .filter(id => id && id !== clientId);

        console.log('[webrtc/init] initial peers to dial =', peerIds);

        peerIds.forEach(id => {
          console.log('[webrtc/init] starting peer', id);
          startPeer(id).catch(e => console.warn('startPeer failed for', id, e));
        });
      }, 100);
    }

    // Bind UI actions
    RTC_bindActions({
      onStart: async () => { await startFanOut(); },
      onEnd: () => {
        RTC_teardownAll();
        connectedPeers.clear();
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

    // Also wire the Video button (kept separate from RTC_bindActions)
    function wireVideoButton() {
      const btn = document.getElementById('rtc-video-btn');
      if (!btn || btn.__wired) return;
      btn.__wired = true;
      btn.onclick = async () => {
        const next = !RTC_isCameraOn();
        const on = await RTC_setCameraEnabled(next);
        RTC_setVideoButton({ enabled: true, on });
      };
    }

    // In case UI was mounted before wiring
    wireVideoButton();

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
  }
}

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
  RTC_setVideoButton({ enabled: false, on: false });
}
