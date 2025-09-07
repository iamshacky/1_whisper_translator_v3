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

    <audio id="rtc-remote-audio" autoplay playsinline></audio>
  `; // ✅ backtick, not a double-quote

  const settingsContainer = document.getElementById('settings-container');
  if (settingsContainer) {
    settingsContainer.appendChild(container);
  } else {
    document.body.appendChild(container);
  }
}

// start__RTC_bindActions_debug_and_delegate
export function RTC_bindActions({ onStart, onEnd, onToggleMic }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');
  const micBtn   = document.getElementById('rtc-mic-btn');

  console.log('[webrtc/ui] binding actions:',
    { hasStart: !!startBtn, hasEnd: !!endBtn, hasMic: !!micBtn });

  if (startBtn) {
    startBtn.onclick = async () => {
      console.log('[webrtc/ui] Start clicked');
      try {
        startBtn.disabled = true;
        await onStart?.();
      } catch (e) {
        console.warn('[webrtc/ui] Start failed:', e);
      } finally {
        setTimeout(() => { try { startBtn.disabled = false; } catch {} }, 3000);
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

  // 🔁 Safety net: if some UI re-render drops handlers, keep a delegated listener
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t && t.id === 'rtc-start-btn' && !t.onclick) {
      console.log('[webrtc/ui] Delegated Start fired (fallback)');
      onStart?.();
    }
  }, true);
}
// end__RTC_bindActions_debug_and_delegate

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

/** Make the Start button green when any peer is connected (local “in-call” indicator) */
export function RTC_setStartActive(active) {
  const startBtn = document.getElementById('rtc-start-btn');
  if (!startBtn) return;
  // Blue default
  const blue = '#007bff';
  const green = '#28a745';
  startBtn.style.background = active ? green : blue;
}

// start__ui_expose_last_presence
export function RTC_updateParticipants(list) {
  const countEl = document.getElementById('rtc-part-count');
  const ul = document.getElementById('rtc-part-list');
  if (!countEl || !ul) return;

  const me = safeReadLocalUser();
  const meId = me?.user_id ?? null;

  countEl.textContent = Array.isArray(list) ? String(list.length) : '0';
  ul.innerHTML = '';

  (list || []).forEach(p => {
    const li = document.createElement('li');
    const displayName = (p.username || 'Someone').trim();
    const isMe = meId && p.user_id && String(meId) === String(p.user_id);
    li.textContent = isMe ? `${displayName} (you)` : displayName;
    ul.appendChild(li);
  });

  // expose for other modules (connection.js can label tiles ontrack)
  window.__lastPresence = list || [];
}
// end__ui_expose_last_presence

function safeReadLocalUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

// Incoming call prompt UI
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


// start__UI_video_grid_mount_and_tile_helpers
/** Mount (or get) a responsive video grid inside the WebRTC panel */
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

/* Start__peer_audio_state_helpers */
const _peerAudioState = new Map(); // key -> { volume: 0..1, muted: boolean }

function __getRemoteAudioEl() {
  return document.getElementById('rtc-remote-audio') || null;
}

function __applyPeerAudioState(peerKey) {
  const { volume = 1, muted = false } = _peerAudioState.get(peerKey) || {};
  const audioEl = __getRemoteAudioEl();
  if (audioEl) {
    audioEl.volume = volume;
    audioEl.muted = muted;
    audioEl.play?.().catch(() => {});
  }
}
/* End__peer_audio_state_helpers */

/* Start__UI_addVideoTile_with_per_peer_volume_and_mute */
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
    const wantMuted = opts.muted === true || peerKey !== 'local';
    video.muted = wantMuted;
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

    const labelEl = document.createElement('div');
    labelEl.id = `${id}-name`;
    labelEl.textContent = opts.label || (peerKey === 'local' ? 'You' : 'Remote');

    const rightControls = document.createElement('div');
    rightControls.style.display = 'flex';
    rightControls.style.alignItems = 'center';
    rightControls.style.gap = '6px';

    const fsBtn = document.createElement('button');
    fsBtn.textContent = '⛶';
    fsBtn.title = 'Fullscreen';
    fsBtn.style.padding = '4px 8px';
    fsBtn.onclick = () => {
      if (!document.fullscreenElement) tile.requestFullscreen?.();
      else document.exitFullscreen?.();
    };

    rightControls.appendChild(fsBtn);
    footer.appendChild(labelEl);
    footer.appendChild(rightControls);

    tile.appendChild(video);
    tile.appendChild(footer);
    grid.appendChild(tile);

    // 🔊 Per-remote controls (remote peers only)
    if (peerKey !== 'local') {
      let controls = tile.querySelector('[data-role="peer-audio-controls"]');
      if (!controls) {
        controls = document.createElement('div');
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
        rightControls.insertBefore(controls, fsBtn);

        // Initialize or restore state
        const state = _peerAudioState.get(peerKey) || { volume: 1, muted: false };
        _peerAudioState.set(peerKey, state);
        vol.value = String(Math.round(state.volume * 100));
        muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';
        __applyPeerAudioState(peerKey);

        // Wire up events
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
    }
  }

  // attach/refresh stream
  const videoEl = document.getElementById(`${id}-video`);
  if (videoEl && videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
  }

  if (opts.label) {
    const labelEl = document.getElementById(`${id}-name`);
    if (labelEl) labelEl.textContent = opts.label;
  }

  // Final safety: keep remote video element muted
  if (peerKey !== 'local') {
    const v = document.getElementById(`${id}-video`);
    if (v) v.muted = true;
  }
}
/* End__UI_addVideoTile_with_per_peer_volume_and_mute */

export function UI_removeVideoTile(peerKey) {
  const id = `rtc-tile-${peerKey}`;
  const el = document.getElementById(id);
  if (el && el.parentNode) {
    const video = el.querySelector('video');
    try { video?.srcObject?.getTracks?.().forEach(t => t.stop()); } catch {}
    el.parentNode.removeChild(el);
  }
}

export function UI_updateVideoLabel(peerKey, label) {
  const labelEl = document.getElementById(`rtc-tile-${peerKey}-name`);
  if (labelEl) labelEl.textContent = label;
}

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

// start__UI_setVideoTileLabel
export function UI_setVideoTileLabel(tileId, label) {
  try {
    const tile = document.querySelector(`[data-tile-id="${tileId}"]`);
    if (!tile) return;
    const cap = tile.querySelector('.rtc-tile-label') || tile.querySelector('[data-role="rtc-tile-label"]');
    if (cap) cap.textContent = label;
  } catch {}
}
// end__UI_setVideoTileLabel
