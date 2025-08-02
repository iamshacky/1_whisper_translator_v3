﻿import { LOGIN__initClient } from '/modules/login/init.js';
LOGIN__initClient();

import { SP_maybePlayAudio } from '/modules/settings-panel/audio.js';
import '/modules/persistence-sqlite/init.js';
import { ROOM__checkIfDeletedAndBlockUI } from '/modules/room_manager_qr/client/helpers.js';


 
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

  // modules/moderation_engine stuff
  const modSettings = JSON.parse(localStorage.getItem('moderator-settings') || '{}');
  const promptVariant = modSettings.promptVariant || 'default';



  let latestTranscript = '';
  let latestAudio = '';
  let latestLanguage = '';
  let moderatorSuggestion = '';
  let previewActive = false;
  let latestWarning = '';
  let latestDetectedLang = '';
  let lastModeratedText = '';
  let lastModeratorContext = '';


  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;

  // 🔁 Shared moderation handler
  async function moderateTextFlow(text, context = 'text') {
    // 🧼 Prevent duplicate moderation
    if (text === lastModeratedText && context === lastModeratorContext) {
      console.log(`⏭️ Skipping redundant moderation for [${context}]`);
      return;
    }
    lastModeratedText = text;
    lastModeratorContext = context;

    const moderationSettings = JSON.parse(localStorage.getItem('moderation-settings') || '{}');
    const autoAcceptCorrections = moderationSettings.autoAcceptCorrections === true;

    console.log(`🧠 Moderating [${context}]: "${text}"`);

    const res = await fetch('/moderate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /*
      body: JSON.stringify({ 
        text, 
        promptVariant: moderationSettings.promptVariant || 'default',
        moderatorPersona: moderationSettings.moderatorPersona || null,
        verbosity: moderationSettings.verbosity || null 
      })
      */
      body: JSON.stringify({ 
        text,
        correctionMode: moderationSettings.correctionMode || 'default',
        toneStyle: moderationSettings.toneStyle || null,
        moderatorPersona: moderationSettings.moderatorPersona || null,
        verbosity: moderationSettings.verbosity || null 
      })
    });

    const result = await res.json();

    if (result.needsCorrection) {
      /*
      handleModeratorResponse({ 
        needsCorrection: result.needsCorrection, 
        suggestedText: result.suggestedText, 
        context,
        autoAcceptCorrections
      });
      */
      handleModeratorResponse({ 
        needsCorrection: result.needsCorrection, 
        suggestedText: result.suggestedText, 
        autoAcceptCorrections,
        context // 👈 put context *inside* the object
      });
    } else {
      const okDiv = document.createElement('div');
      okDiv.className = 'moderator-ok';
      okDiv.innerHTML = `✔️ <em>Moderator approved. No corrections needed.</em>`;
      textPreview.appendChild(okDiv);
    }

    return result;
  }

  ///// WORKAREA 1 — 🎤 Mic button + recording flow
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
  ///// WORKAREA 1 END

  /*
  const chatBtn = document.getElementById('chat-btn');
    if (chatBtn) {
      chatBtn.onclick = () => {
        previewContainer.style.display = 'block';
        textInput.focus();
      };
    } else {
      console.warn("⚠️ chatBtn not found in DOM");
    }
  */
 
  /*
  function handleModeratorResponse(result, context = 'text') {
    const { needsCorrection, suggestedText, autoAcceptCorrections } = result;
  */
  function handleModeratorResponse(result) {
    const { needsCorrection, suggestedText, autoAcceptCorrections, context = 'text' } = result;
    moderatorSuggestion = ''; // Always reset first

    if (needsCorrection && suggestedText) {
      moderatorSuggestion = suggestedText;

      const suggestionDiv = document.createElement('div');
      suggestionDiv.className = 'moderator-suggestion';
      suggestionDiv.innerHTML = `<em>Did you mean:</em> "${moderatorSuggestion}"`;
      textPreview.appendChild(suggestionDiv);

      if (autoAcceptCorrections) {
        document.getElementById('accept-btn').style.display = 'none';  // ✅ hide Accept button
        console.log("✅ Auto-accepting moderator suggestion:", moderatorSuggestion);
        //setTimeout(() => acceptBtn.onclick(), 200); // slight delay to allow preview render
        setTimeout(() => {
          textInput.value = moderatorSuggestion;
          handleSend(); // Send immediately without re-moderation
        }, 200);
      } else {
        document.getElementById('accept-btn').style.display = 'inline-block';

        if (advancedSettings.playWarningAudio) {
          speak(`Did you mean: ${moderatorSuggestion}?`);
        }
      }

      console.log(`💡 Moderator (${context}) suggestion: "${moderatorSuggestion}"`);
      console.log("🟩 Suggestion div inserted into preview:", suggestionDiv);
    } else {
      moderatorSuggestion = '';
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

  async function addMessage({ text, original, translation, audio, lang, sender, warning = '', sourceLang = '', targetLang = '', room = '' }) {
    console.log("🧾 addMessage() for room:", room);
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
    langLabel.textContent = labelText;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = sender === 'me' || sender === 'you' ? 'You said:' : 'They said:';

    const originalWrapper = document.createElement('div');
    originalWrapper.className = 'original';
    if (original && original !== text) {
      originalWrapper.innerHTML = `<em>Corrected:</em> "${text}"<br>Original: "${original}"`;
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
    const isFuzzy = translation.toLowerCase().includes
      ? fuzzyIndicators.some(ind => translation.toLowerCase().includes(ind))
      : false;

    translated.textContent = isFuzzy
      ? "[Unclear translation. Please rephrase or correct the message.]"
      : translation;

    wrapper.append(timestamp, langLabel, label, originalWrapper, translated);

    // ✅ Add "🌍 My Output" if sender is "they"
    if (sender === 'they') {
      try {
        const settings = JSON.parse(localStorage.getItem('translated-output-settings') || '{}');
        if (settings.enabled && settings.lang) {
          const response = await fetch('/api/translated-output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, targetLang: settings.lang })
          });
          const { translation: myOutput } = await response.json();

          if (myOutput) {
            // 🔁 From translated_output_panel module
            const SOP_outputDiv = document.createElement('div');
            SOP_outputDiv.className = 'top-my-output';  // was 'my-output'
            SOP_outputDiv.innerHTML = `🌍 My Output: ${myOutput}`;
            wrapper.appendChild(SOP_outputDiv);
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch "My Output" translation:', err);
      }
    }

    messagesContainer.append(wrapper);
    SP_maybePlayAudio({ audio, translation, sender, lang });
  }

  ///// WORKAREA 2 — 📤 Message sending
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

      const user = JSON.parse(localStorage.getItem('whisper-user') || '{}');

      const room = new URLSearchParams(window.location.search).get('room') || 'default';

      socket.send(JSON.stringify({
        original: text,
        cleaned: latestTranscript,
        translation,
        audio,
        warning,
        clientId,
        moderatorSuggestion,
        inputMethod: 'text',
        detectedLang: latestDetectedLang,
        room,
        user: {
          user_id: user.user_id,
          username: user.username
        }
      }));

      sendBtn.style.display = 'none';
      previewContainer.style.display = 'none';
      previewActive = false;
    };
  }
  ///// WORKAREA 2 END

  deleteBtn.onclick = () => clearPreview();

  const acceptBtn = document.getElementById('accept-btn');

  acceptBtn.onclick = async () => {
    if (!moderatorSuggestion) return;

    const match = moderatorSuggestion.match(/"([^"]+)"/);
    const cleanText = match ? match[1] : moderatorSuggestion;

    textInput.value = cleanText;
    moderatorSuggestion = '';
    acceptBtn.style.display = 'none';

    sendBtn.disabled = true;
    sendBtn.style.opacity = 0.5;
    sendBtn.style.pointerEvents = 'none';

    try {
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

      /*
      if (res.status === 403) {
        alert('❌ This room was deleted and cannot be used.');
        return;
      }
      */
      if (res.status === 403) {
        alert('❌ This room was deleted and cannot be used.');
        setTimeout(() => {
          location.reload();
        }, 300); // small delay ensures alert renders before reload
        return;
      }

      const result = await res.json();

      latestDetectedLang = result.detectedLang || '';

      // Refactor moderator - area 2.1
      // Now set the preview first
      const warning = advancedSettings.showWarnings ? (result.warning || '') : '';
      latestWarning = warning;
      setPreview(result.text, result.translation, result.audio, warning);

      // Then handle moderator suggestion
      await moderateTextFlow(result.text, 'text');

      console.log("📝 Final preview text shown:", result.text);
      console.log("🌐 Final preview translation:", result.translation);
      console.log("⚠️ Detected vs Expected Language Warning:", warning || "(none)");
      console.log("🧭 detectedLang:", latestDetectedLang || "(none)");
      console.log("🎧 audio:", result.audio ? "[yes]" : "[none]");
      console.log("💬 modSuggest:", moderatorSuggestion || "(none)");
    /*
    } catch (err) {
      console.error('❌ Failed to preview typed input:', err);
      alert('⚠️ Could not contact the server. Please check if it crashed.');
    }
    */
    } catch (err) {
      console.error('❌ Failed to preview typed input:', err);

      if (err?.response?.status === 403) {
        alert('❌ This room was deleted and cannot be used.');
      } else {
        alert('⚠️ Could not contact the server. Please check if it crashed.');
      }
    }
  };

  socket.onmessage = async (event) => {
    console.log('🟣 WebSocket message received:', event.data);
    const msg = JSON.parse(event.data);

    // ✅ Only show messages for the current room
    const currentRoom = new URLSearchParams(window.location.search).get('room') || 'default';
    if (msg.room && msg.room !== currentRoom) {
      console.log(`🚫 Skipping message for room "${msg.room}" (current room is "${currentRoom}")`);
      return;
    }

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
          await moderateTextFlow(msg.text, 'voice');

          setPreview(msg.text, msg.translation, msg.audio, langWarning);
          
        } catch (err) {
          console.error('❌ Auto-preview on Accept failed:', err);
        }
      

      console.log("🟨 Preview display updated:");
      console.log("   📝 text        :", msg.text);
      console.log("   🌐 translation :", msg.translation);
      console.log("   ⚠️ warning     :", langWarning || "(none)");
      console.log("   🧭 detectedLang:", msg.detectedLang || "(none)");
      console.log("   🎧 audio       :", msg.audio ? "[yes]" : "[none]");
      console.log("   💬 modSuggest  :", moderatorSuggestion || "(none)");
    }

    ///// WORKAREA 3 — 📨 Handle final messages from server
    if (msg.type === 'final' && msg.original && msg.translation) {
      const lang = msg.detectedLang || '';
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
        targetLang,
        room: msg.room
      });
       // ✅ Save to SQLite
       window.PS_saveFinalMessage?.(msg);
    }
  };
  ///// WORKAREA 3 END

  // 🔁 Load messages from SQLite on page load
  /*
  (async () => {
    const savedMessages = await window.PS_getAllMessages?.();
    if (Array.isArray(savedMessages)) {
      for (const msg of savedMessages) {
        window.PS_renderMessageFromDb?.(msg, messagesContainer);
      }
    }
  })();
  */
  (async () => {
    const savedMessages = await window.PS_getAllMessages?.();
    if (!Array.isArray(savedMessages)) return;

    const currentRoom = new URLSearchParams(window.location.search).get('room') || 'default';

    // ✅ Check if deleted
    const isDeleted = ROOM__checkIfDeletedAndBlockUI(savedMessages, currentRoom);
    if (isDeleted) return;

    for (const msg of savedMessages) {
      window.PS_renderMessageFromDb?.(msg, messagesContainer);
    }
  })();
});
