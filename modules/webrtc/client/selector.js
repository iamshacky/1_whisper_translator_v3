// 🧩 selector.js v2 (minimal loader)
console.log('🧩 selector.js v2 (minimal loader)');

(async () => {
  const impl = (localStorage.getItem('webrtc_impl') || 'vanilla').toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || 'default';

  if (impl === 'livekit') {
    console.log('🎛️ WebRTC selector → LiveKit (stub)');
    const mod = await import('/modules/webrtc_livekit/client/init.js');
    await mod.RTC__initClientFromSelector?.();
  } else {
    console.log('🎛️ WebRTC selector → Vanilla');
    const mod = await import('/modules/webrtc/client/init.js');
    await mod.RTC__initClient?.(roomId);
  }
})();
