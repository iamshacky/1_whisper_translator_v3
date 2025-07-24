// init.js__v1.3 (FINAL FIX)
import { setupQRRoomManager } from './room_ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  const settingsContainer = document.getElementById('settings-container');

  // Inject panel.html once
  const res = await fetch('/modules/room_manager_qr/client/panel.html');
  const html = await res.text();
  settingsContainer.insertAdjacentHTML('beforeend', html);

  // Now setup the logic once DOM is in
  setupQRRoomManager();
});



// New 
// Shows the room name in the UI
export function ROOM__showCurrentRoomBanner() {
  const displayEl = document.getElementById('current-room-display');
  if (!displayEl) return;

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';

  // Try to get nickname (if previously saved)
  let nickname = null;
  try {
    const stored = JSON.parse(localStorage.getItem("whisper-room-names") || '{}');
    nickname = stored?.[roomId] || null;
  } catch (err) {
    console.warn("⚠️ Failed to load room nickname from localStorage", err);
  }

  const label = nickname ? `Room: ${nickname} (${roomId})` : `Room: ${roomId}`;
  displayEl.textContent = label;
}

ROOM__showCurrentRoomBanner();