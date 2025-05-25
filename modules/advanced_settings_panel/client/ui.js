export function ADV_bindSettingsPanelEvents() {
  const toggle = document.getElementById('adv-settings-toggle');
  const panel = document.getElementById('adv-settings-panel');
  const saveBtn = document.getElementById('adv-settings-save');

  if (!toggle || !panel || !saveBtn) {
    console.warn('⚠️ Advanced settings panel not fully loaded.');
    return;
  }

  toggle.onclick = () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };

  saveBtn.onclick = async () => {
    const newCfg = {
      showWarnings: document.getElementById('adv-showWarnings').value === 'true',
      playWarningAudio: document.getElementById('adv-playWarningAudio').value === 'true'
    };

    localStorage.setItem('whisper-advanced-settings', JSON.stringify(newCfg));

    try {
      const res = await fetch('/api/advanced-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg)
      });

      if (res.ok) {
        alert('✅ Advanced settings saved. Reloading...');
        window.location.reload();
      } else {
        alert('⚠️ Failed to save settings.');
      }
    } catch (err) {
      console.error("❌ Failed to save advanced settings:", err);
      alert('❌ Save failed.');
    }
  };
}

export async function ADV_loadSettingsToForm() {
  let cfg;
  const saved = localStorage.getItem('whisper-advanced-settings');
  if (saved) {
    console.log("📦 Loaded advanced settings from localStorage");
    cfg = JSON.parse(saved);
  } else {
    try {
      const res = await fetch('/api/advanced-settings');
      cfg = await res.json();
      console.log("🌐 Loaded advanced settings from server");
    } catch (err) {
      console.warn("⚠️ Failed to load advanced settings:", err);
      cfg = {
        showWarnings: true,
        playWarningAudio: true
      };
    }
  }

  document.getElementById('adv-showWarnings').value = String(cfg.showWarnings);
  document.getElementById('adv-playWarningAudio').value = String(cfg.playWarningAudio);
}
