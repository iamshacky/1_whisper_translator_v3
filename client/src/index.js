﻿import { SPEECH_MODE, PLAY_AUDIO_ON } from './settings.js';

﻿console.log("✅ index.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM fully loaded");

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';



  const messagesContainer = document.getElementById('messages');
  const previewContainer = document.getElementById('preview');
  const textPreview = document.getElementById('text-preview');
  const sendBtn = document.getElementById('send-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const retranslateBtn = document.getElementById('retranslate-btn');
  const textInput = document.getElementById('textInput');
  const previewTextBtn = document.getElementById('previewTextBtn');
  const micBtn = document.getElementById('mic-btn');

  let latestTranscript = '';
  let latestAudio = '';
  let latestLanguage = '';
  let moderatorSuggestion = '';
  let previewActive = false;

  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;

  const langSelect = document.getElementById('output-lang-select'); // ✅ FIRST
  let outputLang = langSelect.value;

  if (outputLang === 'auto') {
    const browserLang = navigator.language.split('-')[0]; // e.g., 'en-US' → 'en'
    outputLang = browserLang || 'en';
  }

  // Save language when changed
  langSelect.addEventListener('change', () => {
    outputLang = langSelect.value === 'auto'
      ? navigator.language.split('-')[0] || 'en'
      : langSelect.value;
  });

  const roomId = new URLSearchParams(location.search).get('room') || 'default';
  const socket = new WebSocket(`${protocol}://${location.host}/ws?lang=${outputLang}&room=${roomId}`);


  // 🎤 Mic recording toggle
  micBtn.onclick = () => {
    if (!isRecording) {
      startRecording();
      micBtn.textContent = '⏹️'; // Stop icon
    } else {
      stopRecording();
      micBtn.textContent = '🎤'; // Mic icon
    }
    isRecording = !isRecording;
  };

  const chatBtn = document.getElementById('chat-btn');
    if (chatBtn) {
      chatBtn.onclick = () => {
        previewContainer.style.display = 'block';
        textInput.focus();
      };
    } else {
      console.warn("⚠️ chatBtn not found in DOM");
    }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioChunks = [];
      socket.send(audioBlob);
      console.log("🎤 Sent audio blob to server");
    };

    mediaRecorder.start();
    console.log("🎙️ Recording started");
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      console.log("🛑 Recording stopped");
    }
  }

  function speak(text, lang = 'en') {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    speechSynthesis.speak(utterance);
  }

  function formatTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  /*
  function setPreview(text, lang, audio) {
    previewActive = true;
    latestTranscript = text;
    latestLanguage = lang;
    latestAudio = audio;

    textPreview.innerHTML = `
      <div><strong>You said:</strong> ${text}</div>
      <div><strong>Translation:</strong> ${lang}</div>
    `;
    sendBtn.style.display = 'inline-block';  // Always show Send after preview

    previewContainer.style.display = 'block';
  }
  */
  function setPreview(text, lang, audio) {
    previewActive = true;
    latestTranscript = text;
    latestLanguage = lang;
    latestAudio = audio;

    textPreview.innerHTML = `
      <div><strong>You said:</strong> ${text}</div>
      <div><strong>Translation:</strong> ${lang}</div>
    `;

    textInput.value = text; // ✅ ← ADD THIS LINE

    sendBtn.style.display = 'inline-block';
    previewContainer.style.display = 'block';
  }

  function clearPreview() {
    previewActive = false;
    textPreview.innerHTML = '';
    previewContainer.style.display = 'none';
    sendBtn.style.display = 'none';
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

    /*
    if (sender === 'they') {
      if (audio) {
        const audioEl = new Audio(`data:audio/mpeg;base64,${audio}`);
        audioEl.play();
      } else {
        speak(translation, lang.split('→')[1]?.trim() || 'en');
      }
    }
    */

    /*
    const isReceiver = sender === 'they';
    const shouldPlay =
      PLAY_AUDIO_ON === 'both' ||
      (PLAY_AUDIO_ON === 'receiver' && isReceiver) ||
      (PLAY_AUDIO_ON === 'sender' && !isReceiver);

    if (shouldPlay) {
      if (SPEECH_MODE === 'tts' && audio) {
        const audioEl = new Audio(`data:audio/mpeg;base64,${audio}`);
        audioEl.play().catch((err) => console.warn('🔇 Autoplay blocked:', err));
      } else if (SPEECH_MODE === 'synthesis') {
        speak(translation, lang.split('→')[1]?.trim() || 'en');
      }
    }
    */
    const isReceiver = sender === 'they';
    const shouldPlay =
      PLAY_AUDIO_ON === 'both' ||
      (PLAY_AUDIO_ON === 'receiver' && isReceiver) ||
      (PLAY_AUDIO_ON === 'sender' && !isReceiver);

    if (shouldPlay) {
      if (SPEECH_MODE === 'tts' && audio) {
        const audioEl = new Audio(`data:audio/mpeg;base64,${audio}`);
        audioEl.play().catch((err) => console.warn('🔇 Autoplay blocked:', err));
      } else if (SPEECH_MODE === 'synthesis') {
        speak(translation, lang.split('→')[1]?.trim() || 'en');
      }
    }
  }

  // ✅ Send button (for previewed content)
  if (sendBtn) {
    sendBtn.onclick = () => {
      console.log("📤 Send button clicked");
      if (!previewActive) return;

      const message = {
        type: 'final',
        text: latestTranscript,
        translation: latestLanguage,
        audio: latestAudio,
        sender: 'me'
      };

      socket.send(JSON.stringify(message));
      /*
      addMessage({
        ...message,
        lang: latestLanguage
      });
      */
      addMessage({
        text: latestTranscript,
        translation: latestLanguage,
        lang: '', // You can fill in language if needed later
        sender: 'me'
      });

      clearPreview();
    };
  }

  deleteBtn.onclick = () => clearPreview();

  const acceptBtn = document.getElementById('accept-btn');

  acceptBtn.onclick = async () => {
    if (!moderatorSuggestion) return;

    const match = moderatorSuggestion.match(/"([^"]+)"/);
    const cleanText = match ? match[1] : moderatorSuggestion;

    textInput.value = cleanText;
    moderatorSuggestion = '';
    acceptBtn.style.display = 'none';

    // 🔒 Temporarily disable Send button to prevent premature send
    sendBtn.disabled = true;
    sendBtn.style.opacity = 0.5;
    sendBtn.style.pointerEvents = 'none';

    try {
      // Optional: remoderate, or skip if already done
      const modRes = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });

      const { needsCorrection, suggestedText } = await modRes.json();
      if (needsCorrection) {
        console.log("✅ Already moderated once — skipping reapply for now");
      }

      const res = await fetch('/manual-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualInput, targetLang: outputLang })
      });

      const result = await res.json();
      setPreview(result.text, result.translation, result.audio);
    } catch (err) {
      console.error('❌ Auto-preview on Accept failed:', err);
    } finally {
      // ✅ Re-enable Send button no matter what
      sendBtn.disabled = false;
      sendBtn.style.opacity = 1;
      sendBtn.style.pointerEvents = 'auto';
    }
  };

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'preview') {
      console.log('📥 Received preview message:', msg);

      const res = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text })
      });

      /*
      const { needsCorrection, suggestedText } = await res.json();
      if (needsCorrection) {
        console.log(`🤖 Moderator suggestion: "${suggestedText}"`);
        speak(`Did you mean: ${suggestedText}?`);
      } else {
        console.log('✅ Moderator says: transcription looks good');
      }
      */
      const modResult = await res.json();
      moderatorSuggestion = '';

      if (modResult.needsCorrection && modResult.suggestedText) {
        moderatorSuggestion = modResult.suggestedText;
        speak(`Did you mean: ${moderatorSuggestion}?`);
        document.getElementById('accept-btn').style.display = 'inline-block';
      } else {
        document.getElementById('accept-btn').style.display = 'none';
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
});
