// modules/persistence_sqlite/client/init.js
import { PS_saveFinalMessage } from './helpers.js';
window.PS_saveFinalMessage = PS_saveFinalMessage;

﻿console.log("✅ PS_init loaded");

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get('room') || 'default';

  try {
    const res = await fetch(`/api/persistence-sqlite/messages?room=${room}`);
    const messages = await res.json();

    console.log(`🕓 PS_loaded ${messages.length} messages from "${room}"`);

    const waitForAddMessage = async () => {
      let maxTries = 50;
      while (typeof window.addMessage !== 'function' && maxTries-- > 0) {
        console.log("⏳ Waiting for window.addMessage...");
        await new Promise(r => setTimeout(r, 50));
      }

      if (typeof window.addMessage !== 'function') {
        console.warn("❌ window.addMessage still undefined after waiting.");
        return;
      }

      console.log("✅ Found window.addMessage, inserting saved messages...");
      /*
      messages.forEach(msg => {
        window.addMessage({
          text: msg.original,
          original: msg.original,
          translation: msg.translation,
          warning: msg.warning || '',
          lang: msg.sourceLang ? `${msg.sourceLang} → ${msg.targetLang}` : '',
          sender: msg.sender === 'me' ? 'me' : 'they',
          sourceLang: msg.sourceLang,
          targetLang: msg.targetLang
        });
      });
      */
      const currentUserId = localStorage.getItem('user-id');

      messages.forEach(msg => {
        const isMine = msg.senderId && msg.senderId === currentUserId;

        window.addMessage({
          text: msg.original,
          original: msg.original,
          translation: msg.translation,
          warning: msg.warning || '',
          lang: msg.sourceLang ? `${msg.sourceLang} → ${msg.targetLang}` : '',
          sender: isMine ? 'me' : 'they',
          sourceLang: msg.sourceLang,
          targetLang: msg.targetLang
        });
      });
    };

    waitForAddMessage();
  } catch (err) {
    console.warn("⚠️ Failed to load messages from persistence:", err);
  }

  // Persist new messages after send
  const originalSend = window.sendBtn?.onclick;
  if (originalSend) {
    window.sendBtn.onclick = async () => {
      await originalSend();

      const text = document.getElementById('textInput').value.trim();
      const translation = window.latestLanguage || '';
      const warning = window.latestWarning || '';
      const sender = 'me';

      try {
        await fetch('/api/persistence-sqlite/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room,
            sender,
            original: text,
            translation,
            warning,
            sourceLang: window.latestDetectedLang || '',
            targetLang: translation,
            timestamp: new Date().toISOString()
          })
        });
        console.log('💾 Message saved to SQLite');
      } catch (err) {
        console.warn('⚠️ Failed to save message:', err);
      }
    };
  }
});


// Expose for global use
window.PS_saveMessage = async function(msg) {
  try {
    await fetch('/api/persistence-sqlite/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    });
    console.log('📦 PS_saved message to database');
  } catch (err) {
    console.warn('⚠️ Failed to save message:', err);
  }
};

