﻿import { SP_maybePlayAudio } from '/plugin/settings-panel/audio.js';

﻿console.log("✅ index.js loaded");

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
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('clientId') || Math.random().toString(36).substring(2);
  const advancedSettings = JSON.parse(localStorage.getItem('whisper-advanced-settings') || '{}');


  let latestTranscript = '';
  let latestAudio = '';
  let latestLanguage = '';
  let moderatorSuggestion = '';
  let previewActive = false;
  let latestWarning = '';
  let latestDetectedLang = '';

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

  function setPreview(text, lang, audio, warning = '') {
    previewActive = true;
    latestTranscript = text;
    latestLanguage = lang;
    latestAudio = audio;
    latestWarning = warning; 

    const warningHTML = warning
      ? `<div class="lang-warning">⚠️ ${warning}</div>`
      : '';

    textPreview.innerHTML = `
      <div><strong>You said:</strong> ${text}</div>
      <div><strong>Translation:</strong> ${lang}</div>
      ${warningHTML}
    `;

    textInput.value = text;
    sendBtn.style.display = 'inline-block';
    previewContainer.style.display = 'block';
  }

  function clearPreview() {
    previewActive = false;
    textPreview.innerHTML = '';
    previewContainer.style.display = 'none';
    sendBtn.style.display = 'none';
    textInput.value = ''; 
    latestWarning = '';
  }

  /*
  function addMessage({ text, translation, audio, lang, sender, warning = '' }) {
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${sender}`;

    if (warning) {
      const warn = document.createElement('div');
      warn.className = 'lang-warning';
      warn.textContent = `⚠️ ${warning}`;
      wrapper.appendChild(warn);
    }

    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = formatTimestamp();

    const langLabel = document.createElement('div');
    langLabel.className = 'lang-label';
    langLabel.textContent = lang;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = sender === 'me' || sender === 'you' ? 'You said:' : 'They said:';

    const original = document.createElement('div');
    original.className = 'original';
    original.textContent = text;

    const translated = document.createElement('div');
    translated.className = 'translated';
    translated.textContent = translation;

    wrapper.append(timestamp, langLabel, label, original, translated);
    messagesContainer.append(wrapper);

    SP_maybePlayAudio({ audio, translation, sender, lang });
  }
  */
  function addMessage({ text, original, translation, audio, lang, sender, warning = '' }) {
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${sender}`;

    if (warning) {
      const warn = document.createElement('div');
      warn.className = 'lang-warning';
      warn.textContent = `⚠️ ${warning}`;
      wrapper.appendChild(warn);
    }

    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = formatTimestamp();

    const langLabel = document.createElement('div');
    langLabel.className = 'lang-label';
    langLabel.textContent = lang;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = sender === 'me' || sender === 'you' ? 'You said:' : 'They said:';

    const originalWrapper = document.createElement('div');
    originalWrapper.className = 'original';
    if (original && original !== text) {
      originalWrapper.innerHTML = `
        <em>Corrected:</em> "${text}"<br>
        Original: "${original}"
      `;
    } else {
      originalWrapper.textContent = text;
    }

    const translated = document.createElement('div');
    translated.className = 'translated';
    //translated.textContent = translation;
    // Filter out fuzzy GPT messages that sound like clarifications instead of translations 
    const fuzzyIndicators = [
      "could you clarify",
      "it seems like",
      "i think you meant",
      "make sure your",
      "the text appears to be",
      "a possible correction is"
    ];

    const isFuzzy = fuzzyIndicators.some(indicator =>
      translation.toLowerCase().includes(indicator)
    );

    translated.textContent = isFuzzy
      ? "[Unclear translation. Please rephrase or correct the message.]"
      : translation;

    wrapper.append(timestamp, langLabel, label, originalWrapper, translated);
    messagesContainer.append(wrapper);

    SP_maybePlayAudio({ audio, translation, sender, lang });
  }

  // ✅ Send button (for previewed content)
  if (sendBtn) {
    /*
    sendBtn.onclick = () => {
      const text = textInput.value.trim();
      const translation = latestLanguage;
      const audio = latestAudio;

      const settings = JSON.parse(localStorage.getItem('whisper-settings') || '{}');
      const expectedLang = settings.inputLangMode === 'manual' ? settings.manualInputLang : null;

      const warning = latestWarning || '';
      
      socket.send(JSON.stringify({
        original: text,
        cleaned: latestTranscript,
        translation,
        audio,
        warning,
        clientId,
        moderatorSuggestion,
        inputMethod: 'text'
      }));

      sendBtn.style.display = 'none';
      previewContainer.style.display = 'none';
    };
    */
     sendBtn.onclick = () => {
      if (!previewActive) {
        alert("Please preview the message before sending.");
        return;
      }

      const text = textInput.value.trim();
      const translation = latestLanguage;
      const audio = latestAudio;

      const settings = JSON.parse(localStorage.getItem('whisper-settings') || '{}');
      const expectedLang = settings.inputLangMode === 'manual' ? settings.manualInputLang : null;
      const warning = latestWarning || '';

      socket.send(JSON.stringify({
        original: text,
        cleaned: latestTranscript,
        translation,
        audio,
        warning,
        clientId,
        moderatorSuggestion,
        inputMethod: 'text'
      }));

      sendBtn.style.display = 'none';
      previewContainer.style.display = 'none';
      previewActive = false;
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

      // 🔁 Re-translate after Accept
      const res = await fetch('/manual-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, targetLang: 'es' })
      });

      //const result = await res.json();
      //setPreview(result.text, result.translation, result.audio);
      const result = await res.json();
      setPreview(result.text, result.translation, result.audio, result.warning || '');
    } catch (err) {
      console.error('❌ Auto-preview on Accept failed:', err);
    } finally {
      // ✅ Re-enable Send button no matter what
      sendBtn.disabled = false;
      sendBtn.style.opacity = 1;
      sendBtn.style.pointerEvents = 'auto';
    }
  };

  previewTextBtn.onclick = async () => {
    const text = textInput.value.trim();
    if (!text) return;

    console.log('📤 Previewing text input:', text);

    const saved = localStorage.getItem('whisper-settings');
    const cfg = saved ? JSON.parse(saved) : {};
    const targetLang = cfg.targetLang || 'es';

    try {
      const res = await fetch('/manual-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang })
      });

      const result = await res.json();
      // Add right after: const result = await res.json();
      const modRes = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.text })
      });

      const { needsCorrection, suggestedText } = await modRes.json();

      if (needsCorrection && suggestedText) {
        moderatorSuggestion = suggestedText;
        if (advancedSettings.playWarningAudio) {
          speak(`Did you mean: ${moderatorSuggestion}?`);
        }
        document.getElementById('accept-btn').style.display = 'inline-block';
      } else {
        document.getElementById('accept-btn').style.display = 'none';
      }
      //setPreview(result.text, result.translation, result.audio);
      /*
      const warning = advancedSettings.showWarnings ? (result.warning || '') : '';
      setPreview(result.text, result.translation, result.audio, warning);
      */
      const warning = advancedSettings.showWarnings ? (result.warning || '') : '';
      // 🟡 Save these globally for use when sending the message
      latestDetectedLang = result.detectedLang || '';
      latestWarning = warning;

      setPreview(result.text, result.translation, result.audio, warning);
    } catch (err) {
      //console.error('❌ Failed to preview typed input:', err);
      console.error('❌ Failed to preview typed input:', err);
      alert('⚠️ Could not contact the server. Please check if it crashed.');
    }
  };


  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'preview') {
      console.log('📥 Received preview message:', msg);

      // Load expected input language from localStorage settings
      const settings = JSON.parse(localStorage.getItem('whisper-settings') || '{}');
      const expectedLang = settings.inputLangMode === 'manual' ? settings.manualInputLang : null;

      let langWarning = '';
      if (expectedLang && msg.detectedLang && msg.detectedLang !== expectedLang) {
        langWarning = `⚠️ Expected "${expectedLang}", but detected "${msg.detectedLang}"`;
      }

      latestDetectedLang = msg.detectedLang;  // ✅ Save detected language globally

      const res = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text })
      });

      const modResult = await res.json();
      moderatorSuggestion = '';
      
      /*
      if (modResult.needsCorrection && modResult.suggestedText) {
        moderatorSuggestion = modResult.suggestedText;
        speak(`Did you mean: ${moderatorSuggestion}?`);
        document.getElementById('accept-btn').style.display = 'inline-block';
      */
      if (modResult.needsCorrection && modResult.suggestedText) {
        moderatorSuggestion = modResult.suggestedText;

        if (advancedSettings.playWarningAudio) {
          speak(`Did you mean: ${moderatorSuggestion}?`);
        }

        document.getElementById('accept-btn').style.display = 'inline-block';
      } else {
        document.getElementById('accept-btn').style.display = 'none';
      }

      // 🟠 Pass langWarning to setPreview
      setPreview(msg.text, msg.translation, msg.audio, langWarning);
    }

    //if (msg.original && msg.translation) {
    if (msg.type === 'final' && msg.original && msg.translation) {
      const lang = msg.detectedLang || '';
      const warning = msg.warning || '';

      addMessage({
        text: msg.original,
        translation: msg.translation,
        audio: msg.audio || null,
        lang,
        warning,
        sender: msg.speaker === 'you' ? 'me' : 'they'
      });
    }
  };
});
