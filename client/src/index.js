import './style.css';
const socket = new WebSocket(`wss://${window.location.host}`);
const messagesContainer = document.getElementById('messages');
const previewContainer = document.getElementById('preview');
const textPreview = document.getElementById('text-preview');
const sendBtn = document.getElementById('send-btn');
const deleteBtn = document.getElementById('delete-btn');
const retranslateBtn = document.getElementById('retranslate-btn');

let latestTranscript = '';
let latestAudio = '';
let latestLanguage = '';
let previewActive = false;

function formatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function speak(text, lang = 'en') {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  speechSynthesis.speak(utterance);
}

function addMessage({ text, translation, audio, lang, sender }) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${sender}`;

  const timestamp = document.createElement('div');
  timestamp.className = 'timestamp';
  timestamp.textContent = formatTimestamp();

  const langLabel = document.createElement('div');
  langLabel.className = 'lang-label';
  langLabel.textContent = lang;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = sender === 'me' ? 'You said:' : 'They said:';

  const original = document.createElement('div');
  original.className = 'original';
  original.textContent = text;

  const translated = document.createElement('div');
  translated.className = 'translated';
  translated.textContent = translation;

  wrapper.append(timestamp, langLabel, label, original, translated);
  messagesContainer.append(wrapper);

  if (sender === 'they' && audio) {
    const audioEl = new Audio(`data:audio/mpeg;base64,${audio}`);
    audioEl.play();
  } else if (sender === 'they') {
    speak(translation, lang.split('→')[1]?.trim() || 'en');
  }
}

function setPreview(text, lang, audio) {
  previewActive = true;
  latestTranscript = text;
  latestLanguage = lang;
  latestAudio = audio;

  textPreview.innerHTML = `
    <div><strong>You said:</strong> ${text}</div>
    <div><strong>Translation:</strong> ${lang}</div>
  `;

  previewContainer.style.display = 'block';
}

function clearPreview() {
  previewActive = false;
  textPreview.innerHTML = '';
  previewContainer.style.display = 'none';
}

sendBtn.onclick = () => {
  if (!previewActive) return;
  socket.send(JSON.stringify({
    text: latestTranscript,
    translation: latestLanguage,
    audio: latestAudio,
    sender: 'me'
  }));
  addMessage({
    text: latestTranscript,
    translation: latestLanguage,
    audio: latestAudio,
    lang: latestLanguage,
    sender: 'me'
  });
  clearPreview();
};

deleteBtn.onclick = () => clearPreview();

retranslateBtn.onclick = () => {
  socket.send(JSON.stringify({
    type: 'retranslate',
    text: latestTranscript,
    lang: latestLanguage
  }));
};

socket.onmessage = async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'preview') {
    const res = await fetch('/moderate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg.text })
    });
    const { needsCorrection, suggestedText } = await res.json();
    if (needsCorrection) {
      speak(`Did you mean: ${suggestedText}?`);
    }

    setPreview(msg.text, msg.translation, msg.audio);
  }

  if (msg.type === 'final') {
    addMessage({
      text: msg.text,
      translation: msg.translation,
      audio: msg.audio,
      lang: msg.translation,
      sender: 'they'
    });
  }
};
