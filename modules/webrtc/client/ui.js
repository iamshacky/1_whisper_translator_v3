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
  `;

  const settingsContainer = document.getElementById('settings-container');
  if (settingsContainer) {
    settingsContainer.appendChild(container);
  } else {
    document.body.appendChild(container);
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


// start__UI_addVideoTile
/** Create (or update) a tile keyed by peerKey (e.g., 'local' or remote clientId) */
export function UI_addVideoTile(tileId, mediaStream, { label = 'Remote', muted = false } = {}) {
  // --- helpers for per-room persistence ---
  function LS_key(id) {
    const room = new URLSearchParams(location.search).get('room') || 'default';
    return `rtc-audio-prefs::${room}::${id}`;
  }
  function loadPrefs(id) {
    try { return JSON.parse(localStorage.getItem(LS_key(id)) || '{}'); } catch { return {}; }
  }
  function savePrefs(id, prefs) {
    try { localStorage.setItem(LS_key(id), JSON.stringify(prefs)); } catch {}
  }

  // Ensure tiles container exists inside the WebRTC panel
  let grid = document.getElementById('rtc-video-tiles');
  if (!grid) {
    const host = document.getElementById('webrtc-area') || document.body;
    grid = document.createElement('div');
    grid.id = 'rtc-video-tiles';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
    grid.style.gap = '8px';
    grid.style.marginTop = '8px';
    host.appendChild(grid);
  }

  // If a tile with this id already exists, update it instead of duplicating
  const existing = document.getElementById(`rtc-tile-${tileId}`);
  if (existing) {
    const v = existing.querySelector('video');
    if (v && v.srcObject !== mediaStream) v.srcObject = mediaStream;
    const nameEl = existing.querySelector('.rtc-tile-name');
    if (nameEl) nameEl.textContent = tileId === 'local' ? 'You' : label;
    return existing;
  }

  // Wrapper
  const tile = document.createElement('div');
  tile.id = `rtc-tile-${tileId}`;
  tile.style.border = '1px solid #ddd';
  tile.style.borderRadius = '6px';
  tile.style.padding = '6px';
  tile.style.background = '#fff';
  tile.style.display = 'flex';
  tile.style.flexDirection = 'column';
  tile.style.gap = '6px';

  // Header (name + controls)
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';

  const name = document.createElement('div');
  name.className = 'rtc-tile-name';
  name.textContent = tileId === 'local' ? 'You' : label;
  name.style.fontWeight = '600';

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '6px';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.style.padding = '4px 8px';
  muteBtn.style.fontSize = '0.85rem';

  const volSlider = document.createElement('input');
  volSlider.type = 'range';
  volSlider.min = '0';
  volSlider.max = '1';
  volSlider.step = '0.01';
  volSlider.value = '1';
  volSlider.style.verticalAlign = 'middle';
  volSlider.style.width = '80px';

  controls.appendChild(muteBtn);
  controls.appendChild(volSlider);
  header.appendChild(name);
  header.appendChild(controls);

  // Video element
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.style.width = '100%';
  video.style.maxHeight = '180px';
  video.style.objectFit = 'cover';
  video.srcObject = mediaStream;

  // Local tile should never play back to the same device
  if (tileId === 'local') muted = true;
  video.muted = !!muted;

  // Restore saved prefs (per-room, per-tile)
  const prefs = loadPrefs(tileId);
  if (typeof prefs.volume === 'number') {
    video.volume = Math.max(0, Math.min(1, Number(prefs.volume)));
    volSlider.value = String(video.volume);
  }
  if (typeof prefs.muted === 'boolean') {
    video.muted = !!prefs.muted;
  }

  // Wire controls
  const setMuteButtonText = () => {
    muteBtn.textContent = video.muted ? 'Unmute' : 'Mute';
  };
  setMuteButtonText();

  muteBtn.onclick = () => {
    video.muted = !video.muted;
    setMuteButtonText();
    savePrefs(tileId, { muted: video.muted, volume: Number(volSlider.value || video.volume || 1) });
  };

  volSlider.oninput = () => {
    const val = Number(volSlider.value || 1);
    video.volume = Math.max(0, Math.min(1, val));
    // If the user moves volume from 0, implicitly unmute (common UX)
    if (video.volume > 0 && video.muted && tileId !== 'local') {
      video.muted = false;
      setMuteButtonText();
    }
    savePrefs(tileId, { muted: video.muted, volume: video.volume });
  };

  // Assemble
  tile.appendChild(header);
  tile.appendChild(video);
  grid.appendChild(tile);

  return tile;
}
// end__UI_addVideoTile

// start__UI_removeVideoTile
/** Remove a tile completely */
export function UI_removeVideoTile(tileId) {
  const tile = document.getElementById(`rtc-tile-${tileId}`);
  if (!tile) return;
  try {
    // Stop any attached video tracks on the element (defensive)
    const v = tile.querySelector('video');
    if (v?.srcObject) {
      const tracks = v.srcObject.getTracks?.() || [];
      tracks.forEach(t => { /* do not stop remote tracks here; peer controls that */ });
      v.srcObject = null;
    }
  } catch {}
  tile.remove();
}
// end__UI_removeVideoTile

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

// start__video_tiles_with_audio_controls
const TILE_MAP = new Map(); // tileId -> { root, videoEl, audioEl, muteBtn, volSlider, labelEl }


function RTC_ensureVideoGrid() {
  let grid = document.getElementById('rtc-video-grid');
  if (grid) return grid;

  const area = document.getElementById('webrtc-area') || document.body;
  grid = document.createElement('div');
  grid.id = 'rtc-video-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
  grid.style.gap = '8px';
  grid.style.marginTop = '8px';
  area.appendChild(grid);
  return grid;
}

/**
 * Create (or replace) a tile for a participant.
 * @param {string} tileId - stable id ('local', 'remote', or future clientId)
 * @param {MediaStream} stream
 * @param {{label?: string, muted?: boolean}} opts
 */

/** External setters (for programmatic control if needed) */
export function UI_setTileAudioMuted(tileId, muted) {
  const rec = TILE_MAP.get(tileId);
  if (!rec) return;
  rec.audioEl.muted = !!muted;
  rec.muteBtn.dataset.muted = rec.audioEl.muted ? 'true' : 'false';
  rec.muteBtn.textContent = rec.audioEl.muted ? 'Unmute' : 'Mute';
}

export function UI_setTileAudioVolume(tileId, volume01) {
  const rec = TILE_MAP.get(tileId);
  if (!rec) return;
  const v = Math.max(0, Math.min(1, Number(volume01) || 0));
  rec.audioEl.volume = v;
  rec.volSlider.value = String(v);
  if (rec.audioEl.muted && v > 0) {
    rec.audioEl.muted = false;
    rec.muteBtn.dataset.muted = 'false';
    rec.muteBtn.textContent = 'Mute';
  }
}