//import { SP_bindSettingsPanelEvents, SP_loadSettingsToForm } from '/plugin/settings-panel/ui.js';
import { SP_bindSettingsPanelEvents, SP_loadSettingsToForm } from '/modules/settings-panel/ui.js';

fetch('/api/settings/ui')
  .then(res => res.text())
  .then(html => {

    //window.injectToSettingsContainer(html);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.getElementById('settings-container')?.appendChild(container);

    SP_bindSettingsPanelEvents();
    SP_loadSettingsToForm();
  });
