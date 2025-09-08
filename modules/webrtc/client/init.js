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
  RTC_setStartActive,
  RTC_setStartLabel
} from './ui.js';

import {
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_startPeer,
  RTC_handleSignal,
  RTC_hangUpPeer,
  RTC_setSignalSender,
  RTC_setCameraEnabled
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
    RTC_setStartActive(false);
    RTC_setStartLabel('Start Call');

    const {
      sendSignal, onSignal,
      sendPresenceJoin, requestPresenceSnapshot,
      onPresence, onOpen, onClose, clientId
    } = RTC_setupSignaling(roomId);

    RTC_setSignalSender(sendSignal);

    const connectedPeers = new Set();
    let callActive = false;
    let wsAlive = false;

    onOpen(() => { wsAlive = true; });
    onClose(() => {
      wsAlive = false;
      // Pause auto-dial if socket dropped (prevents piling up stale ids)
      console.log('[webrtc/init] socket closed → pausing autodial, keeping UI enabled');
    });

    // Presence: dedupe by user (prefer last seen id)
    onPresence(({ participants }) => {
      RTC_updateParticipants(participants || []);
      window.__lastPresence = participants || [];

      // Build a unique set of dialable peerIds
      const mapByUser = new Map(); // key: user_id || username -> clientId
      for (const p of (participants || [])) {
        if (!p?.clientId || p.clientId === clientId) continue;
        const key = (p.user_id != null) ? `u:${p.user_id}` : `n:${p.username || 'Someone'}`;
        mapByUser.set(key, p.clientId); // last one wins
      }
      const wanted = new Set(mapByUser.values());

      // prune peers that are no longer present
      for (const id of Array.from(connectedPeers)) {
        if (!wanted.has(id)) {
          RTC_hangUpPeer(id);
          connectedPeers.delete(id);
        }
      }

      // auto-dial newcomers iff we're in-call and socket is alive
      if (callActive && wsAlive) {
        for (const id of wanted) {
          if (!connectedPeers.has(id)) {
            startPeer(id).catch(e => console.warn('autodial failed for', id, e));
          }
        }
      }
    });

    // Identify self + snapshot
    const me = safeReadLocalUser();
    sendPresenceJoin({ user_id: me?.user_id ?? null, username: me?.username || 'Someone' });
    requestPresenceSnapshot();

    // Handle incoming signaling
    onSignal(async ({ from, payload }) => {
      console.log('[webrtc/init] signal:', payload?.type || 'candidate', 'from', from);

      if (payload?.type === 'offer' && !RTC_isStarted()) {
        RTC_showIncomingPrompt({
          fromId: from,
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            await RTC_startPeer(from, { inboundOffer: payload });
            connectedPeers.add(from);
            callActive = true;
            RTC_setStatus('connecting');
            RTC_setButtons({ canStart: false, canEnd: true });
            RTC_setStartActive(true);
            RTC_setStartLabel('In Call');
            RTC_setMicButton({ enabled: true, muted: false });
            RTC_setVideoButton({ enabled: true, on: false });
          },
          onDecline: () => RTC_hideIncomingPrompt()
        });
      } else {
        await RTC_handleSignal({ from, payload });
        if (payload?.type === 'answer' || payload?.type === 'offer') {
          connectedPeers.add(from);
          callActive = true;
          RTC_setStartActive(true);
          RTC_setStartLabel('In Call');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setVideoButton({ enabled: true, on: false });
        }
      }
    });

    async function startPeer(peerId) {
      if (connectedPeers.has(peerId)) return;
      await RTC_startPeer(peerId);
      connectedPeers.add(peerId);
      callActive = true;
      RTC_setStatus('connecting');
      RTC_setStartActive(true);
      RTC_setStartLabel('In Call');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setMicButton({ enabled: true, muted: false });
      RTC_setVideoButton({ enabled: true, on: false });
    }

    async function startFanOut() {
      console.log('[webrtc/init] startFanOut() called');
      callActive = true;
      RTC_setStatus('connecting');
      RTC_setButtons({ canStart: false, canEnd: true });
      RTC_setStartActive(true);
      RTC_setStartLabel('In Call');
      RTC_setMicButton({ enabled: true, muted: false });
      RTC_setVideoButton({ enabled: true, on: false });

      requestPresenceSnapshot();
      setTimeout(() => {
        const mapByUser = new Map();
        for (const p of (window.__lastPresence || [])) {
          if (!p?.clientId || p.clientId === clientId) continue;
          const key = (p.user_id != null) ? `u:${p.user_id}` : `n:${p.username || 'Someone'}`;
          mapByUser.set(key, p.clientId);
        }
        const peerIds = Array.from(mapByUser.values());
        console.log('[webrtc/init] initial peers to dial =', peerIds);
        peerIds.forEach(id => startPeer(id).catch(e => console.warn('startPeer failed for', id, e)));
      }, 120);
    }

    RTC_bindActions({
      onStart: async () => { await startFanOut(); },
      onEnd: () => {
        RTC_teardownAll();
        connectedPeers.clear();
        callActive = false;
        RTC_setStatus('idle');
        RTC_setButtons({ canStart: true, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setVideoButton({ enabled: false, on: false });
        RTC_setStartActive(false);
        RTC_setStartLabel('Start Call');
      },
      onToggleMic: (currentlyMuted) => {
        const targetEnabled = currentlyMuted ? true : false;
        RTC_setMicEnabled(targetEnabled).then((enabledNow) => {
          RTC_setMicButton({ enabled: true, muted: !enabledNow });
        });
      }
    });

    const videoBtn = document.getElementById('rtc-video-btn');
    if (videoBtn) {
      videoBtn.onclick = async () => {
        const wantOn = videoBtn.textContent.includes('Start');
        const onNow = await RTC_setCameraEnabled(wantOn);
        RTC_setVideoButton({ enabled: true, on: onNow });
      };
    }

  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setVideoButton({ enabled: false, on: false });
    RTC_setStartActive(false);
    RTC_setStartLabel('Start Call');
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
  RTC_setStartActive(false);
  RTC_setStartLabel('Start Call');
}
