import { SP_maybePlayAudio } from '/modules/settings-panel/audio.js';
import '/modules/persistence-sqlite/init.js';

window.onload = () => {
  google.accounts.id.initialize({
    client_id: 'YOUR_GOOGLE_CLIENT_ID_HERE',
    callback: handleGoogleLogin,
  });

  google.accounts.id.renderButton(
    document.getElementById('g_id_signin'),
    { theme: 'outline', size: 'large' }
  );
};

function handleGoogleLogin(response) {
  const payload = parseJwt(response.credential);
  const username = payload.email || payload.name;

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  })
  .then(res => res.json())
  .then(data => {
    window.PS_username = data.username;
    console.log("✅ Logged in as:", data.username);
  });
}

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = decodeURIComponent(atob(base64Url).split('').map((c) =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
  return JSON.parse(base64);
}