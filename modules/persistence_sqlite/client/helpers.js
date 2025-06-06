// modules/persistence_sqlite/client/helpers.js

console.log("✅ PS_helpers loaded");

export function PS_saveFinalMessage(data) {
  const room = new URLSearchParams(window.location.search).get('room') || 'default';
  const senderId = localStorage.getItem('user-id');

  const msgToSave = {
    room,
    sender: data.speaker === 'you' ? 'me' : 'they',
    senderId,
    original: data.original || data.text,
    translation: data.translation || '',
    warning: data.warning || '',
    sourceLang: data.sourceLang || '',
    targetLang: data.targetLang || '',
    timestamp: new Date().toISOString()
  };

  PS_saveMessage(msgToSave);
}

export async function PS_saveMessage(msg) {
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
}

window.PS_saveMessage = PS_saveMessage;
