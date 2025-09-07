// modules/webrtc/client/ui.js
// Adds per-peer hidden <audio> elements so multiple remote streams play at once,
// and volume/mute sliders apply to the correct participant.

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

    <details id="rtc-participants" style="margin-top:10px;">
      <summary>
        Participants: <span id="rtc-part-count">0</span>
      </summary>
      <ul id="rtc-part-list" style="margin:8px 0 0 0; padding-left:18px;"></ul>
    </details>
  `;

  const settingsContainer = document.getElementById('settings-container');
  if (settingsContainer) {
    settingsContainer.appendChild(container);
  } else {
    document.body.appendChild(container);
  }
}

// ── Main buttons
export function RTC_bindActions({ onStart, onEnd, onToggleMic }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');
  const micBtn   = document.getElementById('rtc-mic-btn');

  console.log('[webrtc/ui] binding actions:', { hasStart: !!startBtn, hasEnd: !!endBtn, hasMic: !!micBtn });

  if (startBtn) {
    startBtn.onclick = async () => {
      console.log('[webrtc/ui] Start clicked');
      try {
        startBtn.disabled = true;
        await onStart?.();
      } catch (e) {
        console.warn('[webrtc/ui] Start failed:', e);
      } finally {
        setTimeout(() => { try { startBtn.disabled = false; } catch {} }, 1200);
      }
    };
  }

  if (endBtn) {
    endBtn.onclick = () => {
      console.log('[webrtc/ui] End clicked');
      try { onEnd?.(); } catch (e) { console.warn('[webrtc/ui] End failed:', e); }
    };
  }

  if (micBtn) {
    micBtn.onclick = () => {
      const isCurrentlyMuted = micBtn.dataset.muted === 'true';
      console.log('[webrtc/ui] Mic clicked; currentlyMuted =', isCurrentlyMuted);
      onToggleMic?.(isCurrentlyMuted);
    };
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t && t.id === 'rtc-start-btn' && !t.onclick) {
      console.log('[webrtc/ui] Delegated Start fired (fallback)');
      onStart?.();
    }
  }, true);
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

export function RTC_setStatus(state) {
  const el = document.getElementById('rtc-status');
  if (!el) return;
  el.textContent = state;
}

// Button visuals for Start (blue/green)
function setBtnColor(btn, variant) {
  if (!btn) return;
  btn.style.background = (variant === 'green') ? '#28a745' : '#007bff';
}
export function RTC_setStartActive(active) {
  const startBtn = document.getElementById('rtc-start-btn');
  setBtnColor(startBtn, active ? 'green' : 'blue');
}
export function RTC_setStartLabel(text) {
  const startBtn = document.getElementById('rtc-start-btn');
  if (startBtn) startBtn.textContent = text;
}

// ── Video button (API used by init.js)
export function RTC_ensureVideoButton() {
  const micBtn = document.getElementById('rtc-mic-btn');
  if (!micBtn) return;
  let vidBtn = document.getElementById('rtc-video-btn');
  if (!vidBtn) {
    vidBtn = document.createElement('button');
    vidBtn.id = 'rtc-video-btn';
    vidBtn.textContent = 'Start Video';
    vidBtn.disabled = true;
    micBtn.parentElement?.insertBefore(vidBtn, micBtn.nextSibling);
  }
}
export function RTC_setVideoButton({ enabled, on }) {
  const btn = document.getElementById('rtc-video-btn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.textContent = on ? 'Stop Video' : 'Start Video';
}

// ── Participants
export function RTC_updateParticipants(list) {
  const countEl = document.getElementById('rtc-part-count');
  const ul = document.getElementById('rtc-part-list');
  if (!countEl || !ul) return;

  const me = safeReadLocalUser();
  const myId = me?.user_id ?? null;

  countEl.textContent = Array.isArray(list) ? String(list.length) : '0';
  ul.innerHTML = '';

  (list || []).forEach(p => {
    const li = document.createElement('li');
    const displayName = String(p?.username ?? 'Someone').trim();
    const isMe = myId && p?.user_id && String(myId) === String(p.user_id);
    li.textContent = isMe ? `${displayName} (you)` : displayName;
    ul.appendChild(li);
  });

  // expose for other modules (connection.js can label tiles ontrack)
  window.__lastPresence = list || [];
}

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

// ── Incoming call prompt
export function RTC_showIncomingPrompt({ fromId, onAccept, onDecline }) {
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

// ── Video grid / peer tiles

function UI_getOrCreateVideoGrid() {
  const host = document.getElementById('webrtc-area');
  if (!host) return null;

  let grid = document.getElementById('rtc-video-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'rtc-video-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
    grid.style.gap = '8px';
    grid.style.marginTop = '10px';
    grid.style.alignItems = 'stretch';
    grid.style.justifyItems = 'stretch';
    host.appendChild(grid);
  }
  return grid;
}

const _peerAudioState = new Map();  // peerKey -> { volume: 0..1, muted: boolean }
const _peerAudioEls = new Map();    // peerKey -> HTMLAudioElement

function __applyPeerAudioState(peerKey) {
  const { volume = 1, muted = false } = _peerAudioState.get(peerKey) || {};
  const audioEl = _peerAudioEls.get(peerKey);
  if (audioEl) {
    audioEl.volume = volume;
    audioEl.muted = muted;
    audioEl.play?.().catch(() => {});
  }
}

export function UI_addVideoTile(peerKey, stream, opts = {}) {
  const grid = UI_getOrCreateVideoGrid();
  if (!grid) return;

  const id = `rtc-tile-${peerKey}`;
  let tile = document.getElementById(id);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = id;
    tile.className = 'rtc-tile';
    tile.style.position = 'relative';
    tile.style.background = '#000';
    tile.style.borderRadius = '6px';
    tile.style.overflow = 'hidden';
    tile.style.minHeight = '140px';
    tile.style.display = 'flex';
    tile.style.flexDirection = 'column';

    const video = document.createElement('video');
    video.id = `${id}-video`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = (peerKey === 'local'); // local preview unmuted; remotes muted (audio via <audio>)
    video.style.width = '100%';
    video.style.height = 'auto';
    video.style.flex = '1 1 auto';
    video.style.objectFit = 'cover';

    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'space-between';
    footer.style.gap = '6px';
    footer.style.padding = '6px 8px';
    footer.style.background = 'rgba(255,255,255,0.9)';

    const nameEl = document.createElement('div');
    nameEl.id = `${id}-name`;
    nameEl.textContent = opts.label || (peerKey === 'local' ? 'You' : 'Remote');

    const rightControls = document.createElement('div');
    rightControls.style.display = 'flex';
    rightControls.style.alignItems = 'center';
    rightControls.style.gap = '6px';

    // Per-remote audio controls
    if (peerKey !== 'local') {
      // hidden audio element to actually play the remote audio
      const audioEl = document.createElement('audio');
      audioEl.id = `rtc-audio-${peerKey}`;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.style.display = 'none';
      _peerAudioEls.set(peerKey, audioEl);
      tile.appendChild(audioEl);

      const controls = document.createElement('div');
      controls.dataset.role = 'peer-audio-controls';
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.gap = '6px';

      const vol = document.createElement('input');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '100';
      vol.value = '100';
      vol.title = 'Volume';
      vol.style.width = '100px';
      vol.id = `${id}-volume`;

      const muteBtn = document.createElement('button');
      muteBtn.textContent = 'Mute';
      muteBtn.title = 'Mute this participant';
      muteBtn.id = `${id}-mute`;

      controls.appendChild(vol);
      controls.appendChild(muteBtn);
      rightControls.appendChild(controls);

      const state = _peerAudioState.get(peerKey) || { volume: 1, muted: false };
      _peerAudioState.set(peerKey, state);
      vol.value = String(Math.round(state.volume * 100));
      muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';

      vol.addEventListener('input', () => {
        const v = Math.max(0, Math.min(1, Number(vol.value) / 100));
        const curr = _peerAudioState.get(peerKey) || { volume: 1, muted: false };
        const next = { ...curr, volume: v };
        _peerAudioState.set(peerKey, next);
        __applyPeerAudioState(peerKey);
      });

      muteBtn.addEventListener('click', () => {
        const curr = _peerAudioState.get(peerKey) || { volume: 1, muted: false };
        const next = { ...curr, muted: !curr.muted };
        _peerAudioState.set(peerKey, next);
        muteBtn.textContent = next.muted ? 'Unmute' : 'Mute';
        __applyPeerAudioState(peerKey);
      });
    }

    const fsBtn = document.createElement('button');
    fsBtn.textContent = '⛶';
    fsBtn.title = 'Fullscreen';
    fsBtn.style.padding = '4px 8px';
    fsBtn.onclick = () => {
      if (!document.fullscreenElement) tile.requestFullscreen?.();
      else document.exitFullscreen?.();
    };

    rightControls.appendChild(fsBtn);
    footer.appendChild(nameEl);
    footer.appendChild(rightControls);

    tile.appendChild(video);
    tile.appendChild(footer);
    grid.appendChild(tile);
  }

  // Attach (or refresh) video stream to the tile's <video>
  const videoEl = document.getElementById(`${id}-video`);
  if (videoEl && stream && videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
  }

  if (opts.label) {
    const nameEl = document.getElementById(`${id}-name`);
    if (nameEl) nameEl.textContent = opts.label;
  }
}

// Attach / refresh the hidden <audio> for a remote peer
export function UI_attachAudio(peerKey, stream) {
  let audioEl = _peerAudioEls.get(peerKey);
  if (!audioEl) {
    // Ensure tile exists
    UI_addVideoTile(peerKey, null, { label: 'Remote', muted: true });
    audioEl = document.getElementById(`rtc-audio-${peerKey}`);
    if (!audioEl) {
      // create now if still missing
      audioEl = document.createElement('audio');
      audioEl.id = `rtc-audio-${peerKey}`;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.style.display = 'none';
      const tile = document.getElementById(`rtc-tile-${peerKey}`);
      tile?.appendChild(audioEl);
    }
    _peerAudioEls.set(peerKey, audioEl);
  }
  if (audioEl.srcObject !== stream) {
    audioEl.srcObject = stream;
    __applyPeerAudioState(peerKey);
  }
}

export function UI_removeVideoTile(peerKey) {
  const id = `rtc-tile-${peerKey}`;
  const el = document.getElementById(id);
  if (el && el.parentNode) {
    try {
      el.querySelectorAll('video,audio').forEach(media => {
        try { media.srcObject && media.srcObject.getTracks?.().forEach(t => t.stop()); } catch {}
        try { media.srcObject = null; } catch {}
      });
    } catch {}
    el.parentNode.removeChild(el);
  }
  _peerAudioEls.delete(peerKey);
  _peerAudioState.delete(peerKey);
}

export function UI_updateVideoLabel(peerKey, label) {
  const nameEl = document.getElementById(`rtc-tile-${peerKey}-name`);
  if (nameEl) nameEl.textContent = label;
}
