// modules/settings_panel/client/init.js

import { SP_bindSettingsPanelEvents, SP_loadSettingsToForm } from '/plugin/settings-panel/ui.js';

fetch('/api/settings/ui')
  .then(res => res.text())
  .then(html => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    SP_bindSettingsPanelEvents();
    SP_loadSettingsToForm();
  });
