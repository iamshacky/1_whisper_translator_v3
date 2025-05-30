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

  function handleModeratorResponse(result, context = 'text') {
    moderatorSuggestion = ''; // Always reset first

    if (result.needsCorrection && result.suggestedText) {
      moderatorSuggestion = result.suggestedText;

      if (advancedSettings.playWarningAudio) {
        speak(`Did you mean: ${moderatorSuggestion}?`);
      }

      document.getElementById('accept-btn').style.display = 'inline-block';

      const suggestionDiv = document.createElement('div');
      suggestionDiv.className = 'moderator-suggestion';
      suggestionDiv.innerHTML = `<em>Did you mean:</em> "${moderatorSuggestion}"`;
      textPreview.appendChild(suggestionDiv);

      console.log(`💡 Moderator (${context}) suggestion: "${moderatorSuggestion}"`);
      console.log("🟩 Suggestion div inserted into preview:", suggestionDiv);
    } else {
      document.getElementById('accept-btn').style.display = 'none';

      const okDiv = document.createElement('div');
      okDiv.className = 'moderator-ok';
      okDiv.innerHTML = `✔️ <em>Moderator approved. No corrections needed.</em>`;
      textPreview.appendChild(okDiv);

      console.log(`✅ Moderator (${context}) approved with no corrections.`);
      console.log("🟩 Moderator approval div inserted into preview:", okDiv);
    }
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

  function addMessage({ text, original, translation, audio, lang, sender, warning = '', sourceLang = '', targetLang = '' }) {
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

    const labelText = sourceLang && targetLang ? `${sourceLang} → ${targetLang}` : lang || '';
    //const labelText = 'en → de'; // Hardcoded test
    langLabel.textContent = labelText;

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

      // 🟨 Always update warning before sending (from latestDetectedLang)
      let warning = '';
      if (expectedLang && latestDetectedLang && expectedLang !== latestDetectedLang) {
        warning = `⚠️ Expected "${expectedLang}", but detected "${latestDetectedLang}"`;
      } else {
        warning = latestWarning || '';
      }

      console.log("📤 Sending message:");
      console.log("   📝 original       :", text);
      console.log("   🧹 cleaned        :", latestTranscript);
      console.log("   🌐 translation    :", translation);
      console.log("   ⚠️ warning         :", warning);
      console.log("   🧠 modSuggestion  :", moderatorSuggestion);
      console.log("   🎧 audio present? :", !!audio);
      console.log("   📥 inputMethod    : text");

      socket.send(JSON.stringify({
        original: text,
        cleaned: latestTranscript,
        translation,
        audio,
        warning,
        clientId,
        moderatorSuggestion,
        inputMethod: 'text',
        detectedLang: latestDetectedLang
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

    // 🔒 Disable Send during async flow
    sendBtn.disabled = true;
    sendBtn.style.opacity = 0.5;
    sendBtn.style.pointerEvents = 'none';

    try {
      // 🧠 Re-check moderation (usually fast, often skipped)
      const modRes = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });

      const { needsCorrection, suggestedText } = await modRes.json();
      if (needsCorrection) {
        console.log("🧠 Moderator still flagged the correction, skipping reapply");
      }

      // ✅ Get target language from saved settings
      const saved = localStorage.getItem('whisper-settings');
      const cfg = saved ? JSON.parse(saved) : {};
      const targetLang = cfg.targetLang || 'es';

      console.log("🌐 Accept flow: translating corrected text...");
      console.log("   📝 Cleaned text:", cleanText);
      console.log("   🎯 Target language:", targetLang);

      const translateRes = await fetch('/manual-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, targetLang })
      });

      const result = await translateRes.json();

      const warning = advancedSettings.showWarnings ? (result.warning || '') : '';

      // Save global state for Send
      latestTranscript = cleanText;
      latestLanguage = targetLang;
      latestAudio = result.audio;
      latestWarning = warning;

      setPreview(result.text, result.translation, result.audio, warning);

      console.log("✅ Accept re-translation complete:");
      console.log("   📝 Final text       :", result.text);
      console.log("   🌐 Final translation:", result.translation);
      console.log("   ⚠️ Warning           :", warning);
      console.log("   🎧 Audio available? :", !!result.audio);
    } catch (err) {
      console.error('❌ Auto-preview on Accept failed:', err);
    } finally {
      sendBtn.disabled = false;
      sendBtn.style.opacity = 1;
      sendBtn.style.pointerEvents = 'auto';
    }
  };

  acceptBtn.style.display = 'none'; // 🧼 hide by default on page load
  
  previewTextBtn.onclick = async () => {
    const text = textInput.value.trim();
    if (!text) return;

    console.log('📤 Previewing text input:', text);

    try {
      const saved = localStorage.getItem('whisper-settings');
      const cfg = saved ? JSON.parse(saved) : {};
      const targetLang = cfg?.targetLang || 'es';

      const res = await fetch('/manual-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang })
      });

      const result = await res.json();

      latestDetectedLang = result.detectedLang || '';

      // Now set the preview first
      const warning = advancedSettings.showWarnings ? (result.warning || '') : '';
      latestWarning = warning;
      setPreview(result.text, result.translation, result.audio, warning);

      // Then handle moderator suggestion
      const modRes = await fetch('/moderate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.text })
      });

      const { needsCorrection, suggestedText } = await modRes.json();
      await handleModeratorResponse({ needsCorrection, suggestedText, context: 'text' });

      console.log("📝 Final preview text shown:", result.text);
      console.log("🌐 Final preview translation:", result.translation);
      console.log("⚠️ Detected vs Expected Language Warning:", warning || "(none)");
      console.log("🧭 detectedLang:", latestDetectedLang || "(none)");
      console.log("🎧 audio:", result.audio ? "[yes]" : "[none]");
      console.log("💬 modSuggest:", moderatorSuggestion || "(none)");

    } catch (err) {
      console.error('❌ Failed to preview typed input:', err);
      alert('⚠️ Could not contact the server. Please check if it crashed.');
    }
  };

  socket.onmessage = async (event) => {
    console.log('🟣 WebSocket message received:', event.data);
    const msg = JSON.parse(event.data);

      if (msg.type === 'preview') {
        console.log('📥 Received preview message:', msg);

        const settings = JSON.parse(localStorage.getItem('whisper-settings') || '{}');
        const expectedLang = settings.inputLangMode === 'manual' ? settings.manualInputLang : null;

        let langWarning = '';
        if (expectedLang && msg.detectedLang && msg.detectedLang !== expectedLang) {
          langWarning = `⚠️ Expected "${expectedLang}", but detected "${msg.detectedLang}"`;
        }

        latestDetectedLang = msg.detectedLang;

        try {
          const modRes = await fetch('/moderate-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: msg.text })
          });

          const modResult = await modRes.json();
          moderatorSuggestion = '';

          setPreview(msg.text, msg.translation, msg.audio, langWarning);
          handleModeratorResponse(modResult, 'voice');
        } catch (err) {
          console.error('❌ Auto-preview on Accept failed:', err);
        }

      const modResult = await res.json();
      moderatorSuggestion = '';

      console.log("🧠 Moderation results (voice input):");
      console.log("   ✏️ needsCorrection :", modResult.needsCorrection);
      console.log("   💬 suggestedText   :", modResult.suggestedText || "(none)");
      
      if (modResult.needsCorrection && modResult.suggestedText) {
  moderatorSuggestion = modResult.suggestedText;

        if (advancedSettings.playWarningAudio) {
          speak(`Did you mean: ${moderatorSuggestion}?`);
        }

        document.getElementById('accept-btn').style.display = 'inline-block';

        console.log(`💡 Moderator suggestion: "${moderatorSuggestion}"`);

        // Append the moderator suggestion to the preview box
        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'moderator-suggestion';
        suggestionDiv.innerHTML = `<em>Did you mean:</em> "${moderatorSuggestion}"`;
        textPreview.appendChild(suggestionDiv);

      } else {
        document.getElementById('accept-btn').style.display = 'none';
      }

      // 🟠 Pass langWarning to setPreview
      setPreview(msg.text, msg.translation, msg.audio, langWarning);
      
      if (moderatorSuggestion) {
        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'moderator-suggestion';
        suggestionDiv.innerHTML = `<em>Did you mean:</em> "${moderatorSuggestion}"`;
        textPreview.appendChild(suggestionDiv);
      } else {
        // No correction needed — show light reassurance
        const okDiv = document.createElement('div');
        okDiv.className = 'moderator-ok';
        okDiv.innerHTML = `✔️ <em>Moderator approved. No corrections needed.</em>`;
        textPreview.appendChild(okDiv);
      }

      console.log("🟨 Preview display updated:");
      console.log("   📝 text        :", msg.text);
      console.log("   🌐 translation :", msg.translation);
      console.log("   ⚠️ warning     :", langWarning || "(none)");
      console.log("   🧭 detectedLang:", msg.detectedLang || "(none)");
      console.log("   🎧 audio       :", msg.audio ? "[yes]" : "[none]");
      console.log("   💬 modSuggest  :", moderatorSuggestion || "(none)");
    }
    
    /*
    if (msg.type === 'final' && msg.original && msg.translation) {
      const lang = msg.detectedLang || '';
      // 🟩 Check for "translated output" setting
      //? Should this be contained in the translated-output-module and not in this file to keep things modular?
      const outputSettings = JSON.parse(localStorage.getItem('translated-output-settings') || '{}');
      const userLang = outputSettings.lang;
      const shouldRetranslate = outputSettings.enabled && userLang && userLang !== msg.targetLang;

      if (shouldRetranslate) {
        try {
          console.log("🔁 Retargeting message to userLang:", userLang);

          const res = await fetch('/api/translated-output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: msg.translation,
              targetLang: userLang
            })
          });

          const data = await res.json();
          if (data?.translation) {
            msg.translation = data.translation;
            msg.audio = data.audio || null;
            msg.targetLang = userLang;
          }
        } catch (err) {
          console.error("❌ Retargeting failed:", err);
        }
      }

      const warning = msg.warning || '';
      const sourceLang = msg.sourceLang || '';
      const targetLang = msg.targetLang || '';

      console.log("🧾 Final message received:");
      console.log("   sourceLang:", msg.sourceLang);
      console.log("   targetLang:", msg.targetLang);

      addMessage({
        text: msg.original,
        translation: msg.translation,
        audio: msg.audio || null,
        lang,
        warning,
        sender: msg.speaker === 'you' ? 'me' : 'they',
        sourceLang,
        targetLang
      });
    }
    */
    if (msg.type === 'final' && msg.original && msg.translation) {
      const lang = msg.detectedLang || '';
      const warning = msg.warning || '';
      const sourceLang = msg.sourceLang || '';
      const targetLang = msg.targetLang || '';
      const isSelf = msg.speaker === 'you';

      const outputSettings = JSON.parse(localStorage.getItem('translated-output-settings') || '{}');

      if (!isSelf && outputSettings.enabled && outputSettings.lang && msg.translation) {
        try {
          const res = await fetch('/api/translated-output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: msg.translation,
              from: targetLang,
              to: outputSettings.lang
            })
          });

          const data = await res.json();
          if (data.translation) {
            msg.translation = data.translation;
            msg.lang = `${sourceLang} → ${outputSettings.lang}`;
          }
        } catch (err) {
          console.error('❌ Retranslation failed:', err);
        }
      }

      addMessage({
        text: msg.original,
        translation: msg.translation,
        audio: msg.audio || null,
        lang: msg.lang || `${sourceLang} → ${targetLang}`,
        warning,
        sender: msg.speaker === 'you' ? 'me' : 'they',
        sourceLang,
        targetLang
      });
    }
  };
});
