// modules/login/client/ui.js

export function LOGIN__loginButton() {
  // Create container with buttons
  const container = document.createElement('div');
  container.id = 'login-buttons-container';
  container.innerHTML = `
    <button id="login-btn" class="login-ui-btn">Login</button>
    <button id="logout-btn" class="login-ui-btn">Logout</button>
  `;
  document.body.appendChild(container);

  // Setup behavior
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');

  loginBtn.onclick = () => window.location.href = '/login';
  logoutBtn.onclick = () => {
    localStorage.removeItem('whisper-user');
    location.reload();
  };

  const user = JSON.parse(localStorage.getItem('whisper-user') || 'null');
  loginBtn.style.display = user ? 'none' : 'inline-block';
  logoutBtn.style.display = user ? 'inline-block' : 'none';
}
