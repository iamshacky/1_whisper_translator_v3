const storedUser = localStorage.getItem('whisper-user');
if (storedUser) {
  window.location.href = '/'; // already logged in
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const errorMsg = document.getElementById('errorMsg');

  if (!username) {
    errorMsg.textContent = "Please enter a username.";
    return;
  }

  try {
    const res = await fetch('/api/persistence-sqlite/login-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    if (!res.ok) throw new Error("Failed to login.");

    const user = await res.json();
    localStorage.setItem('whisper-user', JSON.stringify(user));

    // ✅ Redirect to main app (index.html)
    window.location.href = '/';
  } catch (err) {
    console.error(err);
    errorMsg.textContent = "Login failed. Try a different name.";
  }
});


/* Stuff that was previously in login.html */

const form = document.getElementById('loginForm');
    const registerBtn = document.getElementById('registerBtn');
    const errorMsg = document.getElementById('errorMsg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();

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

    registerBtn.addEventListener('click', async () => {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();

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
