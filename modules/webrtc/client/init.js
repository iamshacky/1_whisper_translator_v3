// modules/webrtc/client/init.js
import { RTC_setupSignaling } from './signaling.js';
import {
  RTC_start,
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted,
  RTC_setCameraEnabled
} from './connection.js';
import {
  RTC_mountUI,
  RTC_setStatus,
  RTC_bindActions,
  RTC_setButtons,
  RTC_setMicButton,
  RTC_setCameraButton,
  RTC_showIncomingPrompt,
  RTC_hideIncomingPrompt
} from './ui.js';

export async function RTC__initClient(roomId) {
  try {
    RTC_mountUI();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
    RTC_setCameraButton({ enabled: false, on: false });

    const { sendSignal, onSignal } = RTC_setupSignaling(roomId);

    // Offers before start → prompt
    let pendingOffer = null;
    const pendingCandidates = [];
    onSignal(({ payload, from }) => {
      if (payload?.type === 'offer' && !RTC_isStarted()) {
        pendingOffer = payload;
        RTC_showIncomingPrompt({
          onAccept: async () => {
            RTC_hideIncomingPrompt();
            await startCall({ inboundOffer: pendingOffer, pendingCandidates });
            pendingOffer = null; pendingCandidates.length = 0;
          },
          onDecline: () => {
            RTC_hideIncomingPrompt();
            pendingOffer = null; pendingCandidates.length = 0;
          }
        });
      } else if (payload?.candidate && !RTC_isStarted()) {
        pendingCandidates.push(payload);
      }
    });

    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      RTC_setButtons({ canStart: false, canEnd: false });
      RTC_setStatus('connecting');

      await RTC_start({
        roomId,
        sendSignal,
        onSignal,
        inboundOffer,
        pendingCandidates,
        onConnecting: () => RTC_setStatus('connecting'),
        onConnected: () => {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
          RTC_setCameraButton({ enabled: true, on: false });
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
        RTC_teardownAll();
        RTC_setStatus('idle');
        RTC_setButtons({ canStart: true, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
        RTC_setCameraButton({ enabled: false, on: false });
      },
      onToggleMic: (isMuted) => {
        const enabled = RTC_setMicEnabled(isMuted);
        const nowMuted = !enabled;
        RTC_setMicButton({ enabled: true, muted: nowMuted });
      },
      onToggleCamera: async (isOn) => {
        // isOn=true means currently on → turn off; isOn=false → turn on
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
