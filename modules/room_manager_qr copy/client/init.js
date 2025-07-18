// init.js__v1.2
import { initRoomManagerUI } from './room_ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  const settingsContainer = document.getElementById('settings-container');

  // Inject panel.html content
  const res = await fetch('/modules/room_manager_qr/client/panel.html');
  const html = await res.text();
  settingsContainer.insertAdjacentHTML('beforeend', html);

  initRoomManagerUI();
});
