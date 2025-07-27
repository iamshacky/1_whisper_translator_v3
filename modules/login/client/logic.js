// C:\xampp\htdocs\project1\1_whisper_translator_v3\modules\login\client\logic.js

export function LOGIN__checkAndRedirect() {
  if (window.location.pathname === '/login') return;

  const user = JSON.parse(localStorage.getItem('whisper-user') || 'null');
  if (!user) {
    console.warn('🔐 No user logged in. Redirecting to /login...');
    window.location.href = '/login';
    return;
  }

  // ✅ Fetch rooms created by the user and store to localStorage
  fetch(`/api/login/my-created-rooms?user_id=${user.user_id}`)
    .then(res => res.json())
    .then(data => {
      localStorage.setItem('my_created_rooms', JSON.stringify(data.rooms || []));
    })
    .catch(err => {
      console.warn('⚠️ Failed to load user-created rooms:', err);
    });
}
