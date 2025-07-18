// room_ui.js__v1.5 (REVISED)
import { generateRoomId, generateQRCode, saveRoom, loadRooms } from './qr_utils.js';

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
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete room ${room.roomId}?`)) {
          rooms.splice(index, 1);
          localStorage.setItem('qr_rooms', JSON.stringify(rooms));
          updateRoomListUI();
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
  });

  saveBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    saveRoom(currentRoomId, nickname);
    updateRoomListUI();
    alert('Room saved!');
  });

  updateRoomListUI();
}
