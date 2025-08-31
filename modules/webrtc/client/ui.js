// modules/webrtc/client/ui.js

export function RTC_mountUI() {
  if (document.getElementById('webrtc-area')) return;

  const container = document.createElement('div');
  container.id = 'webrtc-area';
  container.className = 'panel-wrapper';
  container.style.marginTop = '10px';

  container.innerHTML = `
    <h3>WebRTC</h3>

    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
      <strong>Status:</strong> <span id="rtc-status">initializing</span>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      <button id="rtc-start-btn">Start Call</button>
      <button id="rtc-end-btn" disabled>End Call</button>
      <button id="rtc-mic-btn" disabled>Mute</button>
      <button id="rtc-cam-btn" disabled>Camera On</button>
    </div>

    <div id="rtc-incoming" style="display:none; background:#fff8e1; border-left:4px solid #ffcc00; padding:8px; border-radius:4px; margin-bottom:8px;">
      <div style="margin-bottom:6px;">Incoming call…</div>
      <div style="display:flex; gap:8px;">
        <button id="rtc-accept-btn">Accept</button>
        <button id="rtc-decline-btn">Decline</button>
      </div>
    </div>

    <div style="display:flex; align-items:center; gap:8px; margin:6px 0;">
      <span style="font-size:0.9rem; color:#555;">Mic level:</span>
      <canvas id="rtc-level-canvas" width="220" height="12" style="border:1px solid #ddd; border-radius:3px;"></canvas>
    </div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start; margin-top:8px;">
      <div>
        <div style="font-size:0.9rem; color:#555; margin-bottom:4px;">Your camera</div>
        <video id="rtc-local-video" autoplay playsinline muted style="width:220px; height:auto; background:#000; border-radius:4px;"></video>
      </div>
      <div>
        <div style="font-size:0.9rem; color:#555; margin-bottom:4px;">Remote video</div>
        <video id="rtc-remote-video" autoplay playsinline style="width:220px; height:auto; background:#000; border-radius:4px;"></video>
      </div>
    </div>

    <audio id="rtc-remote-audio" autoplay playsinline></audio>
  `;

  const settingsContainer = document.getElementById('settings-container');
  if (settingsContainer) {
    settingsContainer.appendChild(container);
  } else {
    document.body.appendChild(container);
  }
}

export function RTC_bindActions({ onStart, onEnd, onToggleMic, onToggleCamera }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');
  const micBtn   = document.getElementById('rtc-mic-btn');
  const camBtn   = document.getElementById('rtc-cam-btn');

  if (startBtn) {
    startBtn.onclick = async () => {
      try {
        startBtn.disabled = true;
        await onStart?.();
      } catch (e) {
        startBtn.disabled = false;
        console.warn('Start failed:', e);
      }
    };
  }

  if (endBtn) endBtn.onclick = () => { try { onEnd?.(); } catch {} };

  if (micBtn) {
    micBtn.onclick = () => {
      const isMuted = micBtn.dataset.muted === 'true';
      onToggleMic?.(isMuted);
    };
  }

  if (camBtn) {
    camBtn.onclick = () => {
      const isOn = camBtn.dataset.on === 'true';
      onToggleCamera?.(isOn);
    };
  }
}

export function RTC_setButtons({ canStart, canEnd }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');
  if (startBtn) startBtn.disabled = !canStart;
  if (endBtn)   endBtn.disabled   = !canEnd;
}

export function RTC_setMicButton({ enabled, muted }) {
  const micBtn = document.getElementById('rtc-mic-btn');
  if (!micBtn) return;
  micBtn.disabled = !enabled;
  micBtn.dataset.muted = muted ? 'true' : 'false';
  micBtn.textContent = muted ? 'Unmute' : 'Mute';
}

export function RTC_setCameraButton({ enabled, on }) {
  const camBtn = document.getElementById('rtc-cam-btn');
  if (!camBtn) return;
  camBtn.disabled = !enabled;
  camBtn.dataset.on = on ? 'true' : 'false';
  camBtn.textContent = on ? 'Camera Off' : 'Camera On';
}

export function RTC_setStatus(state) {
  const el = document.getElementById('rtc-status');
  if (!el) return;
  el.textContent = state;
}

// Incoming call prompt UI
export function RTC_showIncomingPrompt({ onAccept, onDecline }) {
  const box = document.getElementById('rtc-incoming');
  if (!box) return;
  box.style.display = 'block';
  const acceptBtn = document.getElementById('rtc-accept-btn');
  const declineBtn = document.getElementById('rtc-decline-btn');
  acceptBtn.onclick = () => onAccept?.();
  declineBtn.onclick = () => onDecline?.();
}
export function RTC_hideIncomingPrompt() {
  const box = document.getElementById('rtc-incoming');
  if (!box) return;
  box.style.display = 'none';
}
