export function bindTranslatedOutputUI() {
  const toggle = document.getElementById('translated-output-toggle');
  const panel = document.getElementById('translated-output-panel');
  const saveBtn = document.getElementById('translated-output-save');

  if (!toggle || !panel || !saveBtn) {
    console.warn('⚠️ Translated Output panel not fully loaded.');
    return;
  }

  toggle.onclick = () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };

  saveBtn.onclick = () => {
    const enabled = document.getElementById('translated-output-enabled').checked;
    const lang = document.getElementById('translated-output-lang').value;

    const newCfg = {
      enabled,
      lang
    };

    localStorage.setItem('translated-output-settings', JSON.stringify(newCfg));
    alert('✅ Translated Output settings saved.');
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
