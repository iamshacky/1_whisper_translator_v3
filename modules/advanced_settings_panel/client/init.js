//import { ADV_bindSettingsPanelEvents, ADV_loadSettingsToForm } from '/plugin/advanced-settings-panel/ui.js';
import { ADV_bindSettingsPanelEvents, ADV_loadSettingsToForm } from '/modules/advanced-settings-panel/ui.js';

fetch('/api/advanced-settings/ui')
  .then(res => res.text())
  .then(html => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    ADV_bindSettingsPanelEvents();
    ADV_loadSettingsToForm();
  });
