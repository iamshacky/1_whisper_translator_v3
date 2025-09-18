// modules/webrtc/client/ui.js

export function RTC_mountUI() {
  if (document.getElementById('webrtc-area')) return;

  const container = document.createElement('div');
  container.id = 'webrtc-area';
  container.className = 'panel-wrapper';
  container.style.marginTop = '10px';

  // ⬇️ Added the implementation toggle block at the top of the panel
  container.innerHTML = `
    <h3>WebRTC</h3>

    <div id="webrtc-impl-controls" style="display:flex;gap:8px;align-items:center;margin:6px 0 12px 0;flex-wrap:wrap;">
      <label for="webrtc-impl-select" style="font-weight:600;">🔀 Implementation:</label>
      <select id="webrtc-impl-select">
        <option value="vanilla">Vanilla</option>
        <option value="livekit">LiveKit (stub)</option>
      </select>
      <button id="webrtc-impl-apply" disabled>Apply & Reload</button>
      <span id="webrtc-impl-note" style="font-size:0.9rem;color:#666;"></span>
    </div>

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
      <summary>Participants: <span id="rtc-part-count">0</span></summary>
      <ul id="rtc-part-list" style="margin:8px 0 0 0; padding-left:18px;"></ul>
    </details>

    <audio id="rtc-remote-audio" autoplay playsinline></audio>
  `;

  const settingsContainer = document.getElementById('settings-container');
  if (settingsContainer) {
    // keep WebRTC panel at the top
    settingsContainer.insertBefore(container, settingsContainer.firstChild || null);
  } else {
    document.body.appendChild(container);
  }
}

/** Wire the implementation toggle (localStorage-backed) */
export function RTC_wireImplToggle() {
  try {
    const select = document.getElementById('webrtc-impl-select');
    const apply  = document.getElementById('webrtc-impl-apply');
    const note   = document.getElementById('webrtc-impl-note');

    if (!select || !apply) return;

    const current = (localStorage.getItem('webrtc_impl') || 'vanilla').toLowerCase();
    select.value = current;
    apply.disabled = true;

    const updateNote = () => {
      note.textContent = (select.value === 'livekit')
        ? 'Requires LiveKit server config; shows a stub note if not configured.'
        : '';
    };
    updateNote();

    select.addEventListener('change', () => {
      apply.disabled = (select.value === current);
      updateNote();
    });

    apply.addEventListener('click', () => {
      try { localStorage.setItem('webrtc_impl', select.value); } catch {}
      location.reload();
    });
  } catch (e) {
    console.warn('⚠️ Failed to wire WebRTC impl toggle:', e);
  }
}

export function RTC_bindActions({ onStart, onEnd, onToggleMic }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');
  const micBtn   = document.getElementById('rtc-mic-btn');

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

  if (endBtn) {
    endBtn.onclick = () => {
      try { onEnd?.(); } catch {}
    };
  }

  if (micBtn) {
    micBtn.onclick = () => {
      const isCurrentlyMuted = micBtn.dataset.muted === 'true';
      onToggleMic?.(isCurrentlyMuted);
    };
  }
}

export function RTC_setButtons({ canStart, canEnd }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');

  if (startBtn) {
    startBtn.disabled = !canStart;

    // When connected (start disabled & end enabled), tint Start green
    if (!canStart && canEnd) {
      startBtn.dataset.connected = 'true';
      startBtn.style.backgroundColor = '#2e7d32'; // green
      startBtn.style.color = '#fff';
      startBtn.style.borderColor = '#1b5e20';
    } else {
      startBtn.dataset.connected = 'false';
      startBtn.style.backgroundColor = '';
      startBtn.style.color = '';
      startBtn.style.borderColor = '';
    }
  }

  if (endBtn) {
    endBtn.disabled = !canEnd;

    // Make End red only when it’s active
    if (canEnd) {
      endBtn.style.backgroundColor = '#c62828'; // red
      endBtn.style.color = '#fff';
      endBtn.style.borderColor = '#8e0000';
    } else {
      endBtn.style.backgroundColor = '';
      endBtn.style.color = '';
      endBtn.style.borderColor = '';
    }
  }
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

/** 🧑‍🤝‍🧑 Render participants into <details> */
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
    const name = (p.username || 'Someone').trim();
    const isMe = meId && p.user_id && String(meId) === String(p.user_id);
    li.textContent = isMe ? `${name} (you)` : name;
    ul.appendChild(li);
  });
}

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
// Simple in-memory state per peer (1:1 for now → key 'remote')
const _peerAudioState = new Map(); // key -> { volume: 0..1, muted: boolean }

/*
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
*/
function __getRemoteAudioEl(peerKey) {
  // Prefer per-peer element created by LiveKit path, fallback to the legacy global one.
  return (
    document.getElementById(`rtc-remote-audio-${peerKey}`) ||
    document.getElementById('rtc-remote-audio') ||
    null
  );
}

function __applyPeerAudioState(peerKey) {
  const { volume = 1, muted = false } = _peerAudioState.get(peerKey) || {};
  const audioEl = __getRemoteAudioEl(peerKey);
  if (audioEl) {
    audioEl.volume = volume;
    audioEl.muted  = muted;
    audioEl.play?.().catch(() => {});
  }
}
/* End__peer_audio_state_helpers */

/* Start__UI_addVideoTile_with_per_peer_volume_and_mute */
/** Create (or update) a tile keyed by peerKey (e.g., 'local' or remote clientId) */
export function UI_addVideoTile(peerKey, stream, opts = {}) {
  const grid = UI_getOrCreateVideoGrid();
  if (!grid) return;

  const id = `rtc-tile-${peerKey}`;
  let tile = document.getElementById(id);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = id;
    tile.dataset.tileId = peerKey;  // new 9/14
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
    // Local tile can be unmuted for preview; remote tile stays muted to avoid double audio.
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

    const name = document.createElement('div');
    name.id = `${id}-name`;
    name.textContent = opts.label || (peerKey === 'local' ? 'You' : 'Remote');

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
    footer.appendChild(name);
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
    const nameEl = document.getElementById(`${id}-name`);
    if (nameEl) nameEl.textContent = opts.label;
  }

  // Final safety: keep remote video element muted
  if (peerKey !== 'local') {
    const v = document.getElementById(`${id}-video`);
    if (v) v.muted = true;
  }
}
/* End__UI_addVideoTile_with_per_peer_volume_and_mute */

/** Remove a tile completely */
export function UI_removeVideoTile(peerKey) {
  const id = `rtc-tile-${peerKey}`;
  const el = document.getElementById(id);
  if (el && el.parentNode) {
    // stop any streams attached
    const video = el.querySelector('video');
    try { video?.srcObject?.getTracks?.().forEach(t => t.stop()); } catch {}
    el.parentNode.removeChild(el);
  }
}

/** Update the name/label of a tile without touching the video stream */
export function UI_updateVideoLabel(peerKey, label) {
  const nameEl = document.getElementById(`rtc-tile-${peerKey}-name`);
  if (nameEl) nameEl.textContent = label;
}

/** Ensure the WebRTC panel adds a Start/Stop Video button */
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

/** Control state of the video button */
export function RTC_setVideoButton({ enabled, on }) {
  const btn = document.getElementById('rtc-video-btn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.textContent = on ? 'Stop Video' : 'Start Video';
}
// end__UI_video_grid_mount_and_tile_helpers

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

