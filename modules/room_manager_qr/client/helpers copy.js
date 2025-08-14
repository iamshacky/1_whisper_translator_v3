export function ROOM__checkIfDeletedAndBlockUI(messages, roomId) {
  if (!Array.isArray(messages) || messages.length === 0) return false;

  if (messages[0]?.username === 'hide_url') {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = `
      <div class="msg" style="background:#fee;border-left:4px solid red;padding:1rem;">
        ❌ This room was deleted and cannot be used again.
      </div>
    `;

    // 🔒 Disable UI
    document.getElementById('textInput').disabled = true;
    document.getElementById('textInputBar').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('previewTextBtn').disabled = true;
    document.getElementById('mic-btn').disabled = true;

    // 🧹 Clear localStorage entries for the room
    try {
      const qrRooms = JSON.parse(localStorage.getItem('qr_rooms') || '[]');
      const updatedQRRooms = qrRooms.filter(r => r.roomId !== roomId);
      localStorage.setItem('qr_rooms', JSON.stringify(updatedQRRooms));

      const names = JSON.parse(localStorage.getItem('whisper-room-names') || '{}');
      delete names[roomId];
      localStorage.setItem('whisper-room-names', JSON.stringify(names));

      const myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
      const updatedMyRooms = myRooms.filter(r => r !== roomId);
      localStorage.setItem('my_created_rooms', JSON.stringify(updatedMyRooms));
    } catch (err) {
      console.warn('⚠️ Failed to clean up localStorage for deleted room:', err);
    }

    return true;
  }

  return false;
}
