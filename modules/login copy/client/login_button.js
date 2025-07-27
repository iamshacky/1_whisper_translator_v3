// modules/login/client/ui.js

export function LOGIN__loginButton() {
  const user = JSON.parse(localStorage.getItem('whisper-user') || 'null');
  if (!user) return; // Not logged in — skip showing anything

  // Create logout button
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'logout-btn';
  logoutBtn.className = 'login-ui-btn';
  logoutBtn.textContent = 'Logout';

  // Add to top bar
  document.querySelector('.top-bar')?.appendChild(logoutBtn);

  // Logout behavior
  logoutBtn.onclick = () => {
    localStorage.removeItem('whisper-user');
    location.reload();
  };
}
