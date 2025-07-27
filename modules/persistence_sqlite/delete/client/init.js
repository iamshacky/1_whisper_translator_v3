import { renderExpirationSettingsUI, setupExpirationHandlers } from './helpers.js';

export function PERSIST__initClient() {
  const settingsContainer = document.getElementById('settings-container');
  const room = new URLSearchParams(window.location.search).get('room') || 'default';

  // ✅ Only allow panel if user is owner (room is in localStorage)
  const myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
  const isOwner = myRooms.includes(room);

  const isDefaultRoom = room === 'default';

  if (isOwner || isDefaultRoom) {
    const section = renderExpirationSettingsUI();
    settingsContainer.appendChild(section);
    setupExpirationHandlers(room);
  }
}

PERSIST__initClient();  // still runs automatically
