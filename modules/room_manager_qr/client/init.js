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
