// room_ui.js__v1.3
import { generateRoomId, generateQRCode, saveRoom, loadRooms } from './qr_utils.js';

export function initRoomManagerUI() {
  fetch('/modules/room_manager_qr/client/panel.html')
    .then(res => res.text())
    .then(html => {
      const container = document.getElementById('settings-container');
      if (!container) {
        console.warn('⛔ settings-container not found. QR UI not initialized.');
        return;
      }
      container.insertAdjacentHTML('beforeend', html);
      setupQRRoomManager();
    });
}

function setupQRRoomManager() {
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

    for (const room of rooms) {
      const li = document.createElement('li');
      const nick = room.nickname ? ` (${room.nickname})` : '';
      const roomUrl = `${window.location.origin}/?room=${room.roomId}`;

      const link = document.createElement('a');
      link.href = roomUrl;
      link.target = '_blank';
      link.textContent = `${room.roomId}${nick}`;

      const toggleQRBtn = document.createElement('button');
      toggleQRBtn.textContent = '📷 Show QR';
      toggleQRBtn.style.marginLeft = '10px';

      const qrContainer = document.createElement('div');
      qrContainer.style.marginTop = '5px';
      qrContainer.style.display = 'none';

      toggleQRBtn.addEventListener('click', () => {
        if (qrContainer.style.display === 'none') {
          qrContainer.innerHTML = '';
          generateQRCode(roomUrl, qrContainer);
          qrContainer.style.display = 'block';
          toggleQRBtn.textContent = '📕 Hide QR';
        } else {
          qrContainer.style.display = 'none';
          qrContainer.innerHTML = '';
          toggleQRBtn.textContent = '📷 Show QR';
        }
      });

      li.appendChild(link);
      li.appendChild(toggleQRBtn);
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
