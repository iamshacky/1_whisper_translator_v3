// Dynamically injects the moderation settings panel and binds events
/*
import { MOD_bindSettingsPanelEvents, MOD_loadSettings } from './ui.js';

fetch('/modules/moderation_engine/client/panel.html')
// fetch('/moderation-settings/panel.html')
  .then(res => res.text())
  .then(html => {
    const container = document.getElementById('settings-container') || document.body;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    MOD_bindSettingsPanelEvents();
    MOD_loadSettings();
  });
*/

/*
// modules/moderation_engine/client/init.js
import { MOD_bindSettingsPanelEvents, MOD_loadSettings } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  MOD_bindSettingsPanelEvents();
  MOD_loadSettings();
});
*/

// modules/moderation_engine/client/init.js

import { MOD_bindSettingsPanelEvents, MOD_loadSettings } from './ui.js';

// Injects moderation panel into settings-container
fetch('/modules/moderation_engine/client/panel.html')
  .then(res => res.text())
  .then(html => {
    // Inject panel into unified container
    if (window.injectToSettingsContainer) {
      window.injectToSettingsContainer(html);
    } else {
      // Fallback if not available (unlikely)
      const fallbackContainer = document.getElementById('settings-container') || document.body;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      fallbackContainer.appendChild(wrapper);
    }

    MOD_bindSettingsPanelEvents();
    MOD_loadSettings();
  });
