// modules/login/client/ui.js

export function LOGIN__setupUI() {
  const loginBtn = document.createElement('button');
  loginBtn.id = 'login-btn';
  loginBtn.textContent = 'Login';
  loginBtn.style.position = 'fixed';
  loginBtn.style.top = '10px';
  loginBtn.style.left = '10px';
  loginBtn.style.zIndex = 10000;

  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'logout-btn';
  logoutBtn.textContent = 'Logout';
  logoutBtn.style.position = 'fixed';
  logoutBtn.style.top = '10px';
  logoutBtn.style.left = '10px';
  logoutBtn.style.zIndex = 10000;

  document.body.appendChild(loginBtn);
  document.body.appendChild(logoutBtn);

  loginBtn.onclick = () => window.location.href = '/login';
  logoutBtn.onclick = () => {
    localStorage.removeItem('whisper-user');
    location.reload();
  };

  const user = JSON.parse(localStorage.getItem('whisper-user') || 'null');
  loginBtn.style.display = user ? 'none' : 'inline-block';
  logoutBtn.style.display = user ? 'inline-block' : 'none';
}
