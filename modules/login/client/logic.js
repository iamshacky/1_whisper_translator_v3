// modules/login/client/logic.js

export function LOGIN__checkAndRedirect() {
  if (window.location.pathname === '/login') return;

  const user = JSON.parse(localStorage.getItem('whisper-user') || 'null');
  if (!user) {
    console.warn('🔐 No user logged in. Redirecting to /login...');
    window.location.href = '/login';
  }
}
