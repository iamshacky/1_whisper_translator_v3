// modules/persistence_sqlite/client/init.js

import { PS_saveFinalMessage } from './helpers.js';

window.PS_saveFinalMessage = PS_saveFinalMessage;

console.log("✅ PS_init loaded");

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

      const currentUserId = localStorage.getItem('user-id');

      /*
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
      */
     for (const msg of messages) {
      const isMine = msg.senderId && msg.senderId === currentUserId;
      await window.addMessage({
        text: msg.original,
        original: msg.original,
        translation: msg.translation,
        warning: msg.warning || '',
        lang: msg.sourceLang ? `${msg.sourceLang} → ${msg.targetLang}` : '',
        sender: isMine ? 'me' : 'they',
        sourceLang: msg.sourceLang,
        targetLang: msg.targetLang
      });
    }

    // ✅ Scroll once all messages (and async translations) are fully inserted
    scrollMessagesToBottom();

      // ✅ Scroll AFTER all messages are inserted
      //setTimeout(scrollMessagesToBottom, 100);
    };

    function scrollMessagesToBottom() {
      const messagesContainer = document.getElementById('messages');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    waitForAddMessage();
  } catch (err) {
    console.warn("⚠️ Failed to load messages from persistence:", err);
  }
});

