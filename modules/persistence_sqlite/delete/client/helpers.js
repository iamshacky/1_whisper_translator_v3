export function renderExpirationSettingsUI() {
  const container = document.createElement('div');
  container.className = 'panel-wrapper';
  container.innerHTML = `
    <h3 id="expiration-header">Message Expiration</h3>
    <label for="expire-after-select" id="expire-after-label">Auto-delete messages after:</label>
    <select id="expire-after-select">
      <option value="0" data-i18n-key="expire_now">Now (delete all)</option>
      <option value="3600000" data-i18n-key="expire_1h">1 hour</option>
      <option value="43200000" data-i18n-key="expire_12h" selected>12 hours</option>
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

        //alert('Messages deleted.');
        // ✅ LocalStorage cleanup
        try {
          const qrRooms = JSON.parse(localStorage.getItem('qr_rooms') || '[]');
          const updatedQRRooms = qrRooms.filter(r => r.roomId !== currentRoom);
          localStorage.setItem('qr_rooms', JSON.stringify(updatedQRRooms));

          const names = JSON.parse(localStorage.getItem('whisper-room-names') || '{}');
          delete names[currentRoom];
          localStorage.setItem('whisper-room-names', JSON.stringify(names));

          const myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
          const updatedMyRooms = myRooms.filter(r => r !== currentRoom);
          localStorage.setItem('my_created_rooms', JSON.stringify(updatedMyRooms));
        } catch (err) {
          console.warn('⚠️ Failed to clean up localStorage after deletion:', err);
        }

        alert('Messages deleted.');
        setTimeout(() => {
          location.reload();
        }, 300);
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

// So that room_manager_qr can use this too.
export async function deleteRoomAndCleanUI(currentRoom) {
  await fetch(`/api/persistence-sqlite/delete/delete-all?room=${encodeURIComponent(currentRoom)}`, {
    method: 'POST'
  });

  try {
    const qrRooms = JSON.parse(localStorage.getItem('qr_rooms') || '[]');
    const updatedQRRooms = qrRooms.filter(r => r.roomId !== currentRoom);
    localStorage.setItem('qr_rooms', JSON.stringify(updatedQRRooms));

    const names = JSON.parse(localStorage.getItem('whisper-room-names') || '{}');
    delete names[currentRoom];
    localStorage.setItem('whisper-room-names', JSON.stringify(names));

    const myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
    const updatedMyRooms = myRooms.filter(r => r !== currentRoom);
    localStorage.setItem('my_created_rooms', JSON.stringify(updatedMyRooms));
  } catch (err) {
    console.warn('⚠️ Failed to clean up localStorage after deletion:', err);
  }

  alert('Room deleted.');
  setTimeout(() => location.reload(), 300);
}
