export function renderExpirationSettingsUI() {
  const container = document.createElement('div');
  //container.className = 'settings-section';
  container.className = 'panel-wrapper';
  container.innerHTML = `
    <h3>Message Expiration</h3>
    <label for="expire-after-select">Auto-delete messages after:</label>
    <select id="expire-after-select">
      <option value="0">Now (delete all)</option>
      <option value="3600000">1 hour</option>
      <option value="43200000" selected>12 hours</option>
    </select>
    <button id="save-expire-setting">Save</button>
  `;
  return container;
}

export async function setupExpirationHandlers(currentRoom) {
  const select = document.getElementById('expire-after-select');
  const saveBtn = document.getElementById('save-expire-setting');
  const container = select.closest('.panel-wrapper');

  // 🔍 Show panel only if currentRoom is owned
  try {
    const ownedRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
    const isOwner = ownedRooms.includes(currentRoom);

    if (!isOwner && container) {
      container.style.display = 'none';
      return;
    }
  } catch (err) {
    console.warn('⚠️ Could not determine ownership for expiration panel:', err);
    if (container) container.style.display = 'none';
    return;
  }

  // Load current expiration setting if allowed
  try {
    const res = await fetch(`/api/persistence-sqlite/delete/get-expiration?room=${encodeURIComponent(currentRoom)}`);
    const data = await res.json();
    if (data.expires_after_ms != null) {
      select.value = data.expires_after_ms;
    }
  } catch (err) {
    console.warn('Could not fetch expiration setting', err);
  }

  saveBtn.addEventListener('click', async () => {
    const value = parseInt(select.value);

    try {
      if (value === 0) {
        const confirmClear = confirm("Are you sure you want to delete all messages in this room?");
        if (!confirmClear) return;

        await fetch(`/api/persistence-sqlite/delete/delete-all?room=${encodeURIComponent(currentRoom)}`, {
          method: 'POST'
        });

        alert('Messages deleted.');
      }

      await fetch('/api/persistence-sqlite/delete/set-expiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: currentRoom,
          expires_after_ms: value
        })
      });

      saveBtn.textContent = '✅ Saved!';
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
      }, 1500);
    } catch (err) {
      console.error("❌ Failed to save expiration:", err);
      alert('❌ Save failed.');
    }
  });
}
