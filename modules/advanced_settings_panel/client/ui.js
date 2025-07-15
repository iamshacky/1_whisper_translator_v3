export function ADV_bindSettingsPanelEvents() {
  const saveBtn = document.getElementById('adv-settings-save');

  if (!saveBtn) {
    console.warn('⚠️ Advanced settings panel not fully loaded.');
    return;
  }

  saveBtn.onclick = async () => {
    const newCfg = {
      showWarnings: document.getElementById('adv-showWarnings')?.value === 'true',
      playWarningAudio: document.getElementById('adv-playWarningAudio')?.value === 'true'
    };

    localStorage.setItem('whisper-advanced-settings', JSON.stringify(newCfg));

    try {
      const res = await fetch('/api/advanced-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg)
      });

      if (res.ok) {
        // ✅ Confirmation feedback without reload
        saveBtn.textContent = '✅ Saved!';
        saveBtn.disabled = true;
        setTimeout(() => {
          saveBtn.textContent = 'Save';
          saveBtn.disabled = false;
        }, 1500);
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

  const showWarningsEl = document.getElementById('adv-showWarnings');
  const playWarningAudioEl = document.getElementById('adv-playWarningAudio');

  if (showWarningsEl) showWarningsEl.value = String(cfg.showWarnings);
  if (playWarningAudioEl) playWarningAudioEl.value = String(cfg.playWarningAudio);
}
