// room_ui.js__v1.5 (REVISED)
import { generateRoomId, generateQRCode, saveRoom, loadRooms } from './qr_utils.js';
//import { deleteRoomAndCleanUI } from '../../persistence_sqlite/delete/client/helpers.js';


export function setupQRRoomManager() {
  const createBtn = document.getElementById('create-room-btn');
  const saveBtn = document.getElementById('save-room-btn');
  const nicknameInput = document.getElementById('room-nickname');
  const urlSpan = document.getElementById('room-url');
  const roomDetails = document.getElementById('room-details');
  const roomQr = document.getElementById('room-qr');
  const roomList = document.getElementById('saved-room-list');

  if (!createBtn || !saveBtn || !nicknameInput || !urlSpan || !roomDetails || !roomQr || !roomList) {
    console.warn('⛔ One or more Room Manager elements not found. QR UI not initialized.');
    return;
  }

  let currentRoomId = '';

  saveSharedRoom(); // 🔹 Handles "Save this Room" button behavior

  function updateRoomListUI() {
    const rooms = loadRooms();
    roomList.innerHTML = '';

    if (rooms.length === 0) {
      roomList.innerHTML = '<li>No saved rooms yet.</li>';
      return;
    }

    for (const [index, room] of rooms.entries()) {
      const li = document.createElement('li');
      const nick = room.nickname ? ` (${room.nickname})` : '';
      const roomUrl = `${window.location.origin}/?room=${room.roomId}`;

      const link = document.createElement('a');
      link.href = roomUrl;
      link.target = '_blank';
      link.textContent = `${room.roomId}${nick}`;
      li.appendChild(link);

      // 📷 Toggle QR Button
      const toggleQRBtn = document.createElement('button');
      toggleQRBtn.textContent = '📷';
      toggleQRBtn.title = 'Show/Hide QR Code';
      toggleQRBtn.style.marginLeft = '8px';

      const qrContainer = document.createElement('div');
      qrContainer.style.marginTop = '5px';
      qrContainer.style.display = 'none';

      toggleQRBtn.addEventListener('click', () => {
        if (qrContainer.style.display === 'none') {
          qrContainer.innerHTML = '';
          generateQRCode(roomUrl, qrContainer);
          qrContainer.style.display = 'block';
        } else {
          qrContainer.style.display = 'none';
          qrContainer.innerHTML = '';
        }
      });

      // ✏️ Edit Nickname Button
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️';
      editBtn.title = 'Edit nickname';
      editBtn.style.marginLeft = '5px';
      editBtn.addEventListener('click', () => {
        const newNick = prompt('Enter new nickname:', room.nickname || '');
        if (newNick !== null) {
          room.nickname = newNick.trim();
          localStorage.setItem('qr_rooms', JSON.stringify(rooms));
          updateRoomListUI();
        }
      });

      // 🗑️ Delete Button
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'Delete room';
      deleteBtn.style.marginLeft = '5px';
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Delete room ${room.roomId}?`)) {
          rooms.splice(index, 1);
          localStorage.setItem('qr_rooms', JSON.stringify(rooms));
          updateRoomListUI();

          // ✅ Also remove from whisper-room-names
          try {
            const nameMap = JSON.parse(localStorage.getItem('whisper-room-names') || '{}');
            delete nameMap[room.roomId];
            localStorage.setItem('whisper-room-names', JSON.stringify(nameMap));
          } catch (err) {
            console.warn("⚠️ Failed to update whisper-room-names during delete:", err);
          }

          // ✅ Also delete SQL messages if user created the room
          try {
            const createdRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
            if (createdRooms.includes(room.roomId)) {
              const { DEL__deleteRoomMessages } = await import('../../modules/persistence_sqlite/delete/client/api.js');
              await DEL__deleteRoomMessages(room.roomId);
            }
          } catch (err) {
            console.warn("⚠️ Failed to check/remove SQL messages for owned room:", err);
          }

          // ✅ Also remove from whisper-room-names
          try {
            const nameMap = JSON.parse(localStorage.getItem('whisper-room-names') || '{}');
            delete nameMap[room.roomId];
            localStorage.setItem('whisper-room-names', JSON.stringify(nameMap));
          } catch (err) {
            console.warn("⚠️ Failed to update whisper-room-names during delete:", err);
          }
          document.dispatchEvent(new CustomEvent('room-deleted', { detail: { roomId: room.roomId } }));
          setTimeout(() => {
            alert('alrighty then');
            location.reload();
          }, 900);
        }
      });


      li.appendChild(toggleQRBtn);
      li.appendChild(editBtn);
      li.appendChild(deleteBtn);
      li.appendChild(qrContainer);
      roomList.appendChild(li);
    }
  }

  createBtn.addEventListener('click', () => {
    currentRoomId = generateRoomId();
    const roomUrl = `${window.location.origin}/?room=${currentRoomId}`;

    urlSpan.textContent = roomUrl;
    roomDetails.style.display = 'block';
    nicknameInput.value = '';
    roomQr.innerHTML = '';
    generateQRCode(roomUrl, roomQr);

    // ✅ Also mark this as a created room in localStorage
    try {
      const myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
      if (!myRooms.includes(currentRoomId)) {
        myRooms.push(currentRoomId);
        localStorage.setItem('my_created_rooms', JSON.stringify(myRooms));
      }
    } catch (err) {
      console.warn('⚠️ Failed to update my_created_rooms:', err);
    }
  });

  saveBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    saveRoom(currentRoomId, nickname);
    updateRoomListUI();
    alert('Room saved!');
  });

  updateRoomListUI();
}




// Save a shared room. There must be atleast 1 message in a room before a shared room can be saved.
function saveSharedRoom() {
  const saveBtn = document.getElementById('save-current-room-btn');
  const status = document.getElementById('save-room-status');

  if (!saveBtn) return;

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');

  if (!roomId) {
    saveBtn.disabled = true;
    status.textContent = "No room detected in URL.";
    return;
  }

  const already = loadRooms().some(r => r.roomId === roomId);
  if (already) {
    saveBtn.disabled = true;
    status.textContent = "Room already saved.";
    return;
  }

  saveBtn.addEventListener('click', async () => {
    status.textContent = "Checking room usage...";

    try {
      const res = await fetch(`/api/persistence-sqlite/messages?room=${encodeURIComponent(roomId)}`);
      const messages = await res.json();

      if (!Array.isArray(messages) || messages.length === 0) {
        status.textContent = "❌ This room has no messages. Ask someone to use it first.";
        return;
      }

      const nickname = prompt("Enter a nickname for this room:");
      if (!nickname) {
        status.textContent = "❌ Cancelled.";
        return;
      }

      saveRoom(roomId, nickname);
      status.textContent = `✅ Room saved as "${nickname}"`;
      setTimeout(() => {
        location.reload();
      }, 500);

    } catch (err) {
      console.error("❌ Error fetching room messages:", err);
      //status.textContent = "❌ Failed to verify room.";
      setTimeout(() => { status.textContent = ''; }, 3000);
    }
  });
}


// Optional cleanup trigger after a QR deletion if user owns the room
document.addEventListener('room-deleted', (e) => {
  const deletedRoomId = e.detail.roomId;
  const currentRoom = new URLSearchParams(window.location.search).get('room');
  const ownedRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');

  if (currentRoom === deletedRoomId && ownedRooms.includes(currentRoom)) {
    const saveBtn = document.getElementById('save-expiration-btn');
    if (saveBtn) {
      console.log('🧹 Triggering Message Expiration panel cleanup via Save button...');
      saveBtn.click();
    }
  }
});
