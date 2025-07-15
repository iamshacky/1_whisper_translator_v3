export function bindTranslatedOutputUI() {
  const saveBtn = document.getElementById('translated-output-save');

  if (!saveBtn) {
    console.warn('⚠️ Translated Output panel not fully loaded.');
    return;
  }

  saveBtn.onclick = () => {
    const enabled = document.getElementById('translated-output-enabled').checked;
    const lang = document.getElementById('translated-output-lang').value;

    const newCfg = {
      enabled,
      lang
    };

    localStorage.setItem('translated-output-settings', JSON.stringify(newCfg));

    // Visual feedback (✅ Saved!)
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
