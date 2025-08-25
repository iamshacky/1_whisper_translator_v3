// modules/translated_output_panel/client/init.js
import { bindTranslatedOutputUI, loadTranslatedOutputSettings } from './ui.js';
import { setupReTranslationHook } from './retranslate.js';

fetch('/api/translated-output/ui')
  .then(res => res.text())
  .then(html => {
    // Inject into #settings-container or fallback to body
    const container = document.getElementById('settings-container') || document.body;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    bindTranslatedOutputUI();
    loadTranslatedOutputSettings();
    setupReTranslationHook();
  });

