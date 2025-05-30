// Injects the translated output settings panel into the page
import { bindTranslatedOutputUI, loadTranslatedOutputSettings } from './ui.js';
import { setupReTranslationHook } from './retranslate.js';

fetch('/api/translated-output/ui')
  .then(res => res.text())
  .then(html => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    bindTranslatedOutputUI();
    loadTranslatedOutputSettings();
    setupReTranslationHook();
  });
