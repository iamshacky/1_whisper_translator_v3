// modules/persistence_sqlite/client/helpers.js
﻿console.log("✅ PS_helpers loaded");

export function PS_saveFinalMessage(data) {
  const room = new URLSearchParams(window.location.search).get('room') || 'default';
  const msgToSave = {
    room,
    sender: data.speaker === 'you' ? 'me' : 'they',
    senderId: localStorage.getItem('user-id'),
    original: data.original || data.text,
    translation: data.translation || '',
    warning: data.warning || '',
    sourceLang: data.sourceLang || '',
    targetLang: data.targetLang || '',
    timestamp: new Date().toISOString()
  };

  if (window.PS_saveMessage) {
    window.PS_saveMessage(msgToSave);
  } else {
    console.warn('⚠️ PS_saveMessage not found on window');
  }
}
