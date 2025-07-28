// modules/persistence_sqlite/delete/client/api.js

export async function DEL__deleteRoomMessages(roomId) {
  if (!roomId) return;
  try {
    await fetch(`/api/persistence-sqlite/delete/delete-all?room=${encodeURIComponent(roomId)}`, {
      method: 'POST'
    });
    console.log(`🧹 Messages deleted for room: ${roomId}`);
  } catch (err) {
    console.warn(`❌ Failed to delete messages for room ${roomId}:`, err);
  }
}
