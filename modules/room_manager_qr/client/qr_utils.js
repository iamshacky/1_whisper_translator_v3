// qr_utils.js__v1.1

// Random ID like "room-4f39b0"
export function generateRoomId() {
  const id = Math.random().toString(36).substring(2, 10);
  return `room-${id}`;
}

// Save room to localStorage
/*
export function saveRoom(roomId, nickname = '') {
  const existing = loadRooms();
  existing.push({ roomId, nickname });
  localStorage.setItem('qr_rooms', JSON.stringify(existing));
}
*/
// Save room to localStorage (both qr_rooms and whisper-room-names)
export function saveRoom(roomId, nickname = '') {
  // 1. Save to qr_rooms (for QR UI listing)
  const existing = loadRooms();
  existing.push({ roomId, nickname });
  localStorage.setItem('qr_rooms', JSON.stringify(existing));

  // 2. Save to whisper-room-names (for room banner display)
  try {
    const nameMap = JSON.parse(localStorage.getItem('whisper-room-names') || '{}');
    if (nickname) {
      nameMap[roomId] = nickname;
      localStorage.setItem('whisper-room-names', JSON.stringify(nameMap));
    }
  } catch (err) {
    console.warn("⚠️ Failed to update whisper-room-names:", err);
  }
}

// Load rooms
export function loadRooms() {
  try {
    return JSON.parse(localStorage.getItem('qr_rooms')) || [];
  } catch {
    return [];
  }
}

// Create a QR code and attach it to a container
export function generateQRCode(text, container) {
  container.innerHTML = '';
  const img = document.createElement('img');
  const api = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;
  img.src = api;
  img.alt = 'QR code';
  container.appendChild(img);
}
