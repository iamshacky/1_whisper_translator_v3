import { renderExpirationSettingsUI, setupExpirationHandlers } from './helpers.js';

export function PERSIST__initClient() {
  const settingsContainer = document.getElementById('settings-container');
  const room = new URLSearchParams(window.location.search).get('room') || 'default';

  const section = renderExpirationSettingsUI();
  settingsContainer.appendChild(section);

  setupExpirationHandlers(room);
}

PERSIST__initClient();  // ← add this line
