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
