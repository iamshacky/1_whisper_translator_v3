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

    <details id="rtc-participants" style="margin-top:10px;">
      <summary>Participants: <span id="rtc-part-count">0</span></summary>
      <ul id="rtc-part-list" style="margin:8px 0 0 0; padding-left:18px;"></ul>
    </details>

    <div id="rtc-video-grid"
         style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; margin-top:10px;">
    </div>

    <audio id="rtc-remote-audio-dummy" autoplay playsinline style="display:none;"></audio>
  `;

  const settingsContainer = document.getElementById('settings-container');
  (settingsContainer || document.body).appendChild(container);
}

export function RTC_bindActions({ onStart, onEnd, onToggleMic, onToggleCamera }) {
  const startBtn = document.getElementById('rtc-start-btn');
  const endBtn   = document.getElementById('rtc-end-btn');
  const micBtn   = document.getElementById('rtc-mic-btn');
  const camBtn   = document.getElementById('rtc-cam-btn');

  startBtn.onclick = async () => {
    try { startBtn.disabled = true; await onStart?.(); }
    catch (e) { startBtn.disabled = false; console.warn('Start failed:', e); }
  };

  endBtn.onclick = () => { try { onEnd?.(); } catch {} };

  micBtn.onclick = () => {
    const isMuted = micBtn.dataset.muted === 'true';
    onToggleMic?.(isMuted);
  };

  camBtn.onclick = () => {
    const isOn = camBtn.dataset.on === 'true';
    onToggleCamera?.(isOn);
  };
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
  if (el) el.textContent = state;
}

/** 🧑‍🤝‍🧑 Participants UI */
/* Start ui.js__names_map_and_label_refresh */
// 🔤 Global name directory (clientId → username)
const NAME_MAP = new Map();

/* Start ui.js__export_lookup_name */
export function RTC_lookupName(clientId) {
  // returns "" for local tile or unknowns → caller can fallback
  if (!clientId) return '';
  return NAME_MAP.get(clientId) || '';
}
/* End ui.js__export_lookup_name */

/** Update participants list UI AND keep a lookup for labels */
export function RTC_updateParticipants(list) {
  const countEl = document.getElementById('rtc-part-count');
  const ul = document.getElementById('rtc-part-list');
  if (!countEl || !ul) return;

  // 🗺️ refresh name map
  NAME_MAP.clear();
  (list || []).forEach(p => {
    NAME_MAP.set(p.clientId, (p.username || 'Someone').trim());
  });

  // 🧑‍🤝‍🧑 render list
  const me = _safeUser();
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

  // 🎯 also refresh labels on existing tiles
  RTC_refreshVideoLabels();
}

/** Helper: choose label for a given clientId */
function nameFor(clientId) {
  return NAME_MAP.get(clientId) || (clientId ? clientId.slice(0, 6) : 'Someone');
}

/** Refresh all remote tile labels from NAME_MAP */
export function RTC_refreshVideoLabels() {
  const grid = document.getElementById('rtc-video-grid');
  if (!grid) return;
  grid.querySelectorAll('div[id^="rtc-tile-"]').forEach(el => {
    const id = el.id; // e.g., rtc-tile-<clientId> or rtc-tile-local
    if (id === 'rtc-tile-local') return;
    const clientId = id.replace(/^rtc-tile-/, '');
    const badge = el.querySelector('.rtc-badge');
    if (badge) badge.textContent = nameFor(clientId);
  });
}
/* End ui.js__names_map_and_label_refresh */

function _safeUser() {
  try { return JSON.parse(localStorage.getItem('whisper-user') || 'null'); }
  catch { return null; }
}

/** 🎥 Video grid helpers */
export function RTC_upsertLocalTile(stream) {
  const grid = document.getElementById('rtc-video-grid');
  if (!grid) return;

  let el = document.getElementById('rtc-tile-local');
  if (!el) {
    el = _makeTile('rtc-tile-local', 'You');
    grid.prepend(el);
  }
  const vid = el.querySelector('video');
  if (vid && vid.srcObject !== stream) vid.srcObject = stream || null;
}

/* Start ui.js__upsertRemoteTile_use_names */
export function RTC_upsertRemoteTile(clientId, label, stream) {
  const grid = document.getElementById('rtc-video-grid');
  if (!grid) return;

  const id = `rtc-tile-${clientId}`;
  let el = document.getElementById(id);
  if (!el) {
    // if no label passed, compute from NAME_MAP (fallback: short id)
    const computed = label || (clientId ? nameFor(clientId) : 'Remote');
    el = _makeTile(id, computed);
    grid.appendChild(el);
  } else {
    // keep badge in sync even if tile already exists
    const badge = el.querySelector('.rtc-badge');
    if (badge) badge.textContent = label || nameFor(clientId);
  }

  const vid = el.querySelector('video');
  if (vid && vid.srcObject !== stream) vid.srcObject = stream || null;

  // Ensure audio plays for this remote stream
  try {
    let audio = el.querySelector('audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      el.appendChild(audio);
    }
    if (audio.srcObject !== stream) audio.srcObject = stream || null;
  } catch {}
}
/* End ui.js__upsertRemoteTile_use_names */

export function RTC_removeRemoteTile(clientId) {
  const el = document.getElementById(`rtc-tile-${clientId}`);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export function RTC_clearVideoGrid() {
  const grid = document.getElementById('rtc-video-grid');
  if (grid) grid.innerHTML = '';
}

/* Start ui.js__makeTile_add_badge_class */
function _makeTile(id, labelText) {
  const el = document.createElement('div');
  el.id = id;
  el.style.background = '#000';
  el.style.borderRadius = '4px';
  el.style.overflow = 'hidden';
  el.style.position = 'relative';

  const v = document.createElement('video');
  v.autoplay = true;
  v.playsInline = true;
  v.muted = id === 'rtc-tile-local'; // keep local preview muted
  v.style.width = '100%';
  v.style.height = 'auto';
  el.appendChild(v);

  const badge = document.createElement('div');
  badge.className = 'rtc-badge';               // 👈 add a class so we can refresh later
  badge.textContent = labelText;
  badge.style.position = 'absolute';
  badge.style.left = '6px';
  badge.style.bottom = '6px';
  badge.style.background = 'rgba(0,0,0,0.55)';
  badge.style.color = '#fff';
  badge.style.fontSize = '12px';
  badge.style.padding = '2px 6px';
  badge.style.borderRadius = '3px';
  el.appendChild(badge);

  return el;
}
/* End ui.js__makeTile_add_badge_class */

// Incoming call prompt UI
export function RTC_showIncomingPrompt({ onAccept, onDecline }) {
  const box = document.getElementById('rtc-incoming');
  if (!box) return;
  box.style.display = 'block';
  document.getElementById('rtc-accept-btn').onclick = () => onAccept?.();
  document.getElementById('rtc-decline-btn').onclick = () => onDecline?.();
}
export function RTC_hideIncomingPrompt() {
  const box = document.getElementById('rtc-incoming');
  if (box) box.style.display = 'none';
}
