// google_login.js

// Google login button handler
document.addEventListener('DOMContentLoaded', () => {
  const googleBtn = document.getElementById('google-login-btn');
  if (!googleBtn) return;

  // Clicking the button → go to /api/login/google/start
  googleBtn.addEventListener('click', () => {
    window.location.href = '/api/login/google/start';
  });

  // Handle redirect back from /login/success
  if (window.location.pathname === '/login/success') {
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('user_id');
    const username = params.get('username');

    if (user_id && username) {
      // Store in localStorage under whisper-user
      localStorage.setItem(
        'whisper-user',
        JSON.stringify({ user_id, username })
      );

      // Redirect home
      window.location.href = '/';
    }
  }
});

function handleCredentialResponse(response) {
  fetch('/api/login/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: response.credential }),
  })
    .then(res => res.json())
    .then(user => {
      console.log("✅ Logged in:", user);
      localStorage.setItem('user_id', user.user_id);
      localStorage.setItem('username', user.username);
      window.location.href = '/'; // redirect to app
    })
    .catch(err => console.error("❌ Login failed", err));
}

window.onload = function () {
  google.accounts.id.initialize({
    client_id: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
    callback: handleCredentialResponse
  });
  google.accounts.id.renderButton(
    document.getElementById("google-login-btn"),
    { theme: "outline", size: "large" }
  );
};
