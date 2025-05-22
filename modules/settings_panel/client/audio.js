// client/modules/settings_panel/audio.js

const SPEECH_MODE_DEFAULT = 'synthesis';
const PLAY_AUDIO_ON_DEFAULT = 'receiver';

function getRuntimeConfig() {
  const saved = localStorage.getItem('whisper-settings');
  return saved ? JSON.parse(saved) : {
    speechMode: SPEECH_MODE_DEFAULT,
    playAudioOn: PLAY_AUDIO_ON_DEFAULT
  };
}

function speak(text, lang = 'en') {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  speechSynthesis.speak(utterance);
}

export function SP_maybePlayAudio({ audio, translation, sender, lang }) {
  const { speechMode, playAudioOn } = getRuntimeConfig();
  const isReceiver = sender === 'they';

  const shouldPlay =
    playAudioOn === 'both' ||
    (playAudioOn === 'receiver' && isReceiver) ||
    (playAudioOn === 'sender' && !isReceiver);

  if (!shouldPlay) return;

  if (speechMode === 'tts' && audio) {
    const audioEl = new Audio(`data:audio/mpeg;base64,${audio}`);
    audioEl.play().catch((err) => console.warn('🔇 Autoplay blocked:', err));
  } else if (speechMode === 'synthesis') {
    speak(translation, lang.split('→')[1]?.trim() || 'en');
  }
}
