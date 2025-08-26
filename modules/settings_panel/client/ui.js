import { populateLanguageSelect } from '/modules/ui_language_selector/client/languages.js';

export function SP_bindSettingsPanelEvents() {
  const saveBtn = document.getElementById('cfg-save');

  if (!saveBtn) {
    console.warn('⚠️ Settings panel not loaded yet.');
    return;
  }

  const inputLangModeDropdown = document.getElementById('cfg-inputLangMode');
  const manualLangLabel = document.getElementById('manualInputLangLabel');

  if (inputLangModeDropdown && manualLangLabel) {
    inputLangModeDropdown.onchange = () => {
      manualLangLabel.style.display = inputLangModeDropdown.value === 'manual' ? 'block' : 'none';
    };
  }

  saveBtn.onclick = async () => {
    const newCfg = {
      targetLang: document.getElementById('cfg-targetLang').value,
      inputLangMode: document.getElementById('cfg-inputLangMode').value,
      manualInputLang: document.getElementById('cfg-manualInputLang').value,
      speechMode: document.getElementById('cfg-speechMode').value,
      playAudioOn: document.getElementById('cfg-playAudioOn').value
    };

    localStorage.setItem('whisper-settings', JSON.stringify(newCfg));

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg)
      });

      if (res.ok) {
        saveBtn.textContent = '✅ Saved!';
        saveBtn.disabled = true;
        setTimeout(() => {
          saveBtn.textContent = 'Save';
          saveBtn.disabled = false;
        }, 1500);
      } else {
        alert('⚠️ Server rejected settings update.');
      }
    } catch (err) {
      console.error("❌ Failed to save settings:", err);
      alert('❌ Failed to save settings.');
    }
  };
}

// 🔹 helper to (re)populate language dropdowns
function repopulateSettingsDropdowns(cfg) {
  const uiLang = localStorage.getItem('ui_language') || 'en';

  populateLanguageSelect(document.getElementById('cfg-targetLang'), {
    includeAuto: true,
    preselected: cfg.targetLang,
    uiLang
  });

  populateLanguageSelect(document.getElementById('cfg-manualInputLang'), {
    preselected: cfg.manualInputLang,
    uiLang
  });
}

export async function SP_loadSettingsToForm() {
  let cfg;
  const saved = localStorage.getItem('whisper-settings');
  if (saved) {
    console.log("📦 Loaded settings from localStorage");
    cfg = JSON.parse(saved);
  } else {
    try {
      const res = await fetch('/api/settings');
      cfg = await res.json();
      console.log("🌐 Loaded settings from server");
    } catch (err) {
      console.warn("⚠️ Failed to load settings from server:", err);
      cfg = {
        targetLang: 'es',
        inputLangMode: 'auto',
        manualInputLang: 'en',
        speechMode: 'synthesis',
        playAudioOn: 'both'
      };
    }
  }

  // dynamically populate dropdowns
  repopulateSettingsDropdowns(cfg);

  // listen for UI language changes 🔔
  document.addEventListener('ui-language-changed', () => {
    repopulateSettingsDropdowns(cfg);
  });

  // populate non-language fields
  document.getElementById('cfg-inputLangMode').value = cfg.inputLangMode;
  document.getElementById('cfg-speechMode').value = cfg.speechMode;
  document.getElementById('cfg-playAudioOn').value = cfg.playAudioOn;

  document.getElementById('manualInputLangLabel').style.display =
    cfg.inputLangMode === 'manual' ? 'block' : 'none';
}
