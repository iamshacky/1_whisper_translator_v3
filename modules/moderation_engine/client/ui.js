export function MOD_bindSettingsPanelEvents() {
  const saveBtn = document.getElementById('moderation-settings-save');

  if (!saveBtn) {
    console.warn('⚠️ Moderation settings panel not fully loaded.');
    return;
  }

  saveBtn.onclick = () => {
    const newCfg = {
      correctionMode: document.getElementById('correctionMode')?.value || 'default',
      toneStyle: document.getElementById('toneStyle')?.value || '',
      moderatorPersona: document.getElementById('moderatorPersona')?.value || '',
      verbosity: document.getElementById('verbosity')?.value || '',
      autoAcceptCorrections: document.getElementById('autoAcceptCorrections')?.checked || false
    };

    try {
      localStorage.setItem('moderation-settings', JSON.stringify(newCfg));
      
      // ✅ Feedback UI
      saveBtn.textContent = '✅ Saved!';
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
      }, 1500);

    } catch (err) {
      console.error("❌ Failed to save settings:", err);
      alert('❌ Save failed.');
    }
  };
}

export function MOD_loadSettings() {
  const saved = localStorage.getItem('moderation-settings');
  if (!saved) {
    console.log("ℹ️ No saved moderation settings, using default");
    const cmEl = document.getElementById('correctionMode');
    if (cmEl) cmEl.value = 'default';
    return;
  }

  try {
    const cfg = JSON.parse(saved);

    if (document.getElementById('correctionMode')) {
      document.getElementById('correctionMode').value = cfg.correctionMode || 'default';
    }

    if (document.getElementById('toneStyle')) {
      document.getElementById('toneStyle').value = cfg.toneStyle || '';
    }

    if (document.getElementById('moderatorPersona')) {
      document.getElementById('moderatorPersona').value = cfg.moderatorPersona || '';
    }

    if (document.getElementById('verbosity')) {
      document.getElementById('verbosity').value = cfg.verbosity || '';
    }

    if (document.getElementById('autoAcceptCorrections')) {
      document.getElementById('autoAcceptCorrections').checked = !!cfg.autoAcceptCorrections;
    }

    console.log("📦 Loaded moderation settings from localStorage");
  } catch (err) {
    console.warn("⚠️ Failed to parse localStorage moderation settings:", err);
  }
}
