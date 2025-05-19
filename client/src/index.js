﻿﻿console.log("✅ index.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM fully loaded");

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);

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
  let previewActive = false;

  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;

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

    // 🔊 Playback for received messages
    if (sender === 'they') {
      const targetLang = lang.split('→')[1]?.trim() || 'en';

      if (appConfig.useBrowserSpeechSynthesis) {
        speak(`New message: ${translation}`, targetLang);
      } else if (audio) {
        const audioEl = new Audio(`data:audio/mpeg;base64,${audio}`);
        audioEl.play().catch(err => {
          console.warn("🔇 Audio play failed, falling back to speech synthesis.");
          speak(`New message: ${translation}`, targetLang);
        });
      }
    }
  }
  /*
  window.addEventListener('click', () => {
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }, { once: true });
  */
  // 🔓 Unlock speech synthesis on first user interaction
  window.addEventListener('click', () => {
    try {
      const utterance = new SpeechSynthesisUtterance('');
      speechSynthesis.speak(utterance);
      console.log("🔓 Speech synthesis unlocked on first click");
    } catch (err) {
      console.warn("⚠️ Could not unlock speech synthesis:", err);
    }
  }, { once: true });

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

      addMessage({
        ...message,
        lang: latestLanguage
      });

      clearPreview();
    };
  }

  deleteBtn.onclick = () => clearPreview();

  retranslateBtn.onclick = () => {
    socket.send(JSON.stringify({
      type: 'retranslate',
      text: latestTranscript,
      lang: latestLanguage
    }));
  };

  // ✅ Manual text input (Preview)
  previewTextBtn.onclick = async () => {
    const manualInput = textInput.value.trim();
    if (!manualInput) return;

    try {
      // Moderate text first
      const modRes = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualInput })
      });

      const { needsCorrection, suggestedText } = await modRes.json();
      if (needsCorrection) {
        //console.log(`🤖 Moderator suggestion: "${suggestedText}"`);
        //speak(`Did you mean: ${suggestedText}?`);
        // Skip moderation for typed input (optional toggle later)
        console.log("⚠️ Skipping moderation for typed input");

      } else {
        console.log('✅ Moderator says: manual input looks good');
      }

      // Translate text manually
      const res = await fetch('/manual-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualInput, targetLang: 'es' })
      });

      const result = await res.json();

      setPreview(result.text, result.translation, result.audio);
    } catch (err) {
      console.error('❌ Manual preview error:', err);
    }
  };

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'preview') {
      console.log('📥 Received preview message:', msg);
      
      const originalText = msg.text;
      const originalTranslation = msg.translation;
      const originalAudio = msg.audio;

      const res = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text })
      });

      const { needsCorrection, suggestedText } = await res.json();

      const feedbackBox = document.getElementById('moderation-feedback');
      const suggestionEl = document.getElementById('moderation-suggestion');
      const acceptBtn = document.getElementById('accept-suggestion-btn');
      const ignoreBtn = document.getElementById('ignore-suggestion-btn');

      if (needsCorrection) {
        console.log(`🤖 Moderator suggestion: "${suggestedText}"`);
        suggestionEl.textContent = `Did you mean: "${suggestedText}"?`;
        feedbackBox.style.display = 'block';

        acceptBtn.onclick = async () => {
          feedbackBox.style.display = 'none';

          const translationRes = await fetch('/manual-translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: suggestedText, targetLang: 'es' })
          });

          const result = await translationRes.json();
          setPreview(result.text, result.translation, result.audio);
        };

        ignoreBtn.onclick = () => {
          feedbackBox.style.display = 'none';
          console.log('🙈 User ignored suggestion');
          //setPreview(msg.text, msg.translation, msg.audio);
          setPreview(originalText, originalTranslation, originalAudio);
        };

      } else {
        console.log('✅ Moderator says: transcription looks good');
        feedbackBox.style.display = 'none';
        setPreview(msg.text, msg.translation, msg.audio);
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
