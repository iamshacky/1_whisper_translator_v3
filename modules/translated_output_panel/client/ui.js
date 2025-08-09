import { populateLanguageSelect } from '/modules/ui_language_selector/client/languages.js';

export function bindTranslatedOutputUI() {
  const saveBtn = document.getElementById('translated-output-save');
  const langSelect = document.getElementById('translated-output-lang');

  if (!saveBtn || !langSelect) {
    console.warn('⚠️ Translated Output panel not fully loaded.');
    return;
  }

  // Populate language select with full names
  populateLanguageSelect(langSelect, {
    preselected: localStorage.getItem('translated-output-settings')
      ? JSON.parse(localStorage.getItem('translated-output-settings')).lang
      : 'en'
  });

  saveBtn.onclick = () => {
    const enabled = document.getElementById('translated-output-enabled').checked;
    const lang = langSelect.value;

    const newCfg = { enabled, lang };
    localStorage.setItem('translated-output-settings', JSON.stringify(newCfg));

    // Visual feedback
    saveBtn.textContent = '✅ Saved!';
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }, 1500);
  };
}

export function loadTranslatedOutputSettings() {
  const saved = localStorage.getItem('translated-output-settings');
  if (!saved) return;

  try {
    const { enabled, lang } = JSON.parse(saved);
    document.getElementById('translated-output-enabled').checked = enabled;
    document.getElementById('translated-output-lang').value = lang;
  } catch (err) {
    console.warn("⚠️ Failed to load translated output settings:", err);
  }
}
