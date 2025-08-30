// modules/webrtc/client/init.js
// Public surface
import { RTC_setupSignaling } from './signaling.js';
import {
  RTC_start,
  RTC_teardownAll,
  RTC_setMicEnabled,
  RTC_isStarted
} from './connection.js';
import {
  RTC_mountUI,
  RTC_setStatus,
  RTC_bindActions,
  RTC_setButtons,
  RTC_setMicButton,
  RTC_showIncomingPrompt,
  RTC_hideIncomingPrompt
} from './ui.js';

export async function RTC__initClient(roomId) {
  try {
    RTC_mountUI();
    RTC_setStatus('idle');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false }); // disabled until call starts

    // Signaling can be ready before user starts the call
    const { sendSignal, onSignal } = RTC_setupSignaling(roomId);

    // Buffer offers/candidates that may arrive before user clicks "Start"
    let pendingOffer = null;
    const pendingCandidates = [];

    const unsubscribePreStart = onSignal(({ payload, from }) => {
      // Incoming offer BEFORE we've started anything → prompt user
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
        // Collect ICE for later if we haven't started yet
        pendingCandidates.push(payload);
      }
    });

    async function startCall({ inboundOffer = null, pendingCandidates = [] } = {}) {
      RTC_setButtons({ canStart: false, canEnd: false });
      RTC_setStatus('connecting');

      await RTC_start({
        roomId,
        sendSignal,
        onSignal, // connection layer will (re)subscribe with its own handler
        inboundOffer,
        pendingCandidates,
        onConnecting: () => RTC_setStatus('connecting'),
        onConnected: () => {
          RTC_setStatus('connected');
          RTC_setButtons({ canStart: false, canEnd: true });
          RTC_setMicButton({ enabled: true, muted: false });
        },
        onTeardown: () => {
          RTC_setStatus('idle');
          RTC_setButtons({ canStart: true, canEnd: false });
          RTC_setMicButton({ enabled: false, muted: false });
        }
      });
    }

    // Wire the UI buttons
    RTC_bindActions({
      onStart: async () => {
        await startCall();
      },
      onEnd: () => {
        RTC_teardownAll();
        RTC_setStatus('idle');
        RTC_setButtons({ canStart: true, canEnd: false });
        RTC_setMicButton({ enabled: false, muted: false });
      },
      onToggleMic: (muted) => {
        const nowMuted = RTC_setMicEnabled(!muted) === false; // returns track.enabled; false means muted
        RTC_setMicButton({ enabled: true, muted: nowMuted });
      }
    });

    // If the QR/Delete flow announces a room deletion, kill the call instantly
    document.addEventListener('room-deleted', () => {
      RTC_teardownAll();
      RTC_setStatus('deleted');
      RTC_setButtons({ canStart: false, canEnd: false });
      RTC_setMicButton({ enabled: false, muted: false });
      RTC_hideIncomingPrompt();
    });
  } catch (err) {
    console.warn('RTC init failed:', err);
    RTC_setStatus('error');
    RTC_setButtons({ canStart: true, canEnd: false });
    RTC_setMicButton({ enabled: false, muted: false });
  }
}

// Auto-init UI (but NOT the call)
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';
  await RTC__initClient(roomId);
});

// Optional external teardown
export function RTC__teardown() {
  RTC_teardownAll();
  RTC_setStatus('idle');
  RTC_setButtons({ canStart: true, canEnd: false });
  RTC_setMicButton({ enabled: false, muted: false });
}
