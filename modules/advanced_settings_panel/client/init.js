import { ADV_bindSettingsPanelEvents, ADV_loadSettingsToForm } from '/modules/advanced-settings-panel/ui.js';

fetch('/api/advanced-settings/ui')
  .then(res => res.text())
  .then(html => {
    // Inject into the shared settings container
    window.injectToSettingsContainer(html);

    // Then bind logic
    ADV_bindSettingsPanelEvents();
    ADV_loadSettingsToForm();
  });
