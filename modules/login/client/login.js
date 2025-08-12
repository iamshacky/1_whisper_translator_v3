// modules/login/client/login.js

// If already logged in, redirect to main app
const storedUser = localStorage.getItem('whisper-user');
if (storedUser) {
  window.location.href = '/';
}

// DOM elements
const form = document.getElementById('loginForm');
const registerBtn = document.getElementById('registerBtn');
const errorMsg = document.getElementById('errorMsg');

// LOGIN handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    errorMsg.textContent = 'Please enter both username and password.';
    return;
  }

  try {
    const res = await fetch('/api/login/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const user = await res.json();
    if (!res.ok) throw new Error(user.error || 'Login failed.');

    localStorage.setItem('whisper-user', JSON.stringify(user));
    window.location.href = '/';
  } catch (err) {
    errorMsg.textContent = err.message;
  }
});

// REGISTRATION handler
registerBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    errorMsg.textContent = 'Please enter both username and password.';
    return;
  }

  try {
    const res = await fetch('/api/login/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const user = await res.json();
    if (!res.ok) throw new Error(user.error || 'Registration failed.');

    localStorage.setItem('whisper-user', JSON.stringify(user));
    window.location.href = '/';
  } catch (err) {
    errorMsg.textContent = err.message;
  }
});
