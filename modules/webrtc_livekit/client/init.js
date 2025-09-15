// modules/webrtc_livekit/client/init.js
// Stub implementation with the same public surface we'll use later.
// Keeps the app happy when 'livekit' is selected before we wire it up.

export async function RTC__initClientFromSelector() {
  console.log('🧪 LiveKit stub initialized (no-op).');
  // You can mount a tiny UI note if you want:
  try {
    const host = document.getElementById('settings-container') || document.body;
    const note = document.createElement('div');
    note.className = 'panel-wrapper';
    note.style.borderLeft = '4px solid #999';
    note.style.background = '#f9f9f9';
    note.style.marginTop = '10px';
    note.innerHTML = `<strong>LiveKit</strong> (stub) — toggle is wired.`;
    host.appendChild(note);
  } catch {}
}
