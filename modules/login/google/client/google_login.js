// modules/login/google/client/google_login.js
document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('google-login-btn');

  // Render a simple button if you like
  if (host && !host.querySelector('button')) {
    const btn = document.createElement('button');
    btn.textContent = 'Sign in with Google';
    btn.style.padding = '10px 16px';
    btn.onclick = () => (window.location.href = '/api/login/google/start');
    host.appendChild(btn);
  }

  // Handle /login/success → stash user in localStorage, then go home
  if (location.pathname === '/login/success') {
    const p = new URLSearchParams(location.search);
    const user_id = p.get('user_id');
    const username = p.get('username');
    if (user_id && username) {
      localStorage.setItem('whisper-user', JSON.stringify({ user_id: Number(user_id), username }));
    }
    location.href = '/';
  }
});
