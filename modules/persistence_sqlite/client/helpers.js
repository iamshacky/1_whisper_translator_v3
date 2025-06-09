console.log("✅ PS_helpers loaded");

export function PS_getRoom() {
  return new URLSearchParams(window.location.search).get("room") || "default";
}

export function PS_saveMessage(msg) {
  fetch("/api/persistence-sqlite/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  }).catch((err) => {
    console.error("❌ Failed to save message:", err);
  });
}

/*
export function PS_getAllMessages(room = PS_getRoom()) {
  return fetch(`/api/persistence-sqlite/messages?room=${room}`)
    .then((res) => res.json())
    .catch((err) => {
      console.error("❌ Failed to load messages:", err);
      return [];
    });
}
*/
export async function PS_getAllMessages() {
  try {
    const res = await fetch('/api/persistence-sqlite/load');
    if (!res.ok) throw new Error('Failed to load messages');
    return await res.json();
  } catch (err) {
    console.error('PS_getAllMessages error:', err);
    return [];
  }
}

export function PS_saveFinalMessage(data) {
  const deviceId = window.PS_myDeviceId || localStorage.getItem("deviceId") || "unknown";
  const room = PS_getRoom();

  const msg = {
    room,
    deviceId,
    sender: data.deviceId === deviceId ? "me" : "they",
    original: data.original || data.text,
    translation: data.translation || "",
    warning: data.warning || "",
    sourceLang: data.sourceLang || "",
    targetLang: data.targetLang || "",
    timestamp: Date.now(),
    audio: data.audio || null
  };

  PS_saveMessage(msg);
  return msg.sender;
}

/*
export function renderMessageFromDb(msg) {
  const {
    id,
    speaker,
    original,
    text,
    translation,
    warning,
    sourceLang,
    targetLang,
    timestamp,
    audio,
    deviceId
  } = msg;

  const sender = (deviceId === window.PS_myDeviceId) ? 'me' : 'they';

  const bubble = document.createElement('div');
  bubble.classList.add('message', sender);
  if (audio) bubble.classList.add('has-audio');

  bubble.innerHTML = `
    <div class="original-text">${text || original || ''}</div>
    <div class="translation-text">${translation || ''}</div>
    <div class="meta">
      ${sourceLang ? `<span>${sourceLang} → ${targetLang}</span>` : ''}
      ${warning ? `<span class="warning">${warning}</span>` : ''}
      ${timestamp ? `<span class="timestamp">${new Date(Number(timestamp)).toLocaleString()}</span>` : ''}
    </div>
  `;

  const container = document.querySelector('#messages') || document.body;
  container.appendChild(bubble);
}
*/
export function renderMessageFromDb(msg, messagesContainer) {
  const {
    text,
    original,
    translation,
    warning = '',
    sourceLang = '',
    targetLang = '',
    timestamp,
    audio,
    deviceId
  } = msg;

  const sender = (deviceId === PS_myDeviceId) ? 'me' : 'they';
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${sender}`;

  if (warning) {
    const warn = document.createElement('div');
    warn.className = 'lang-warning';
    warn.textContent = `⚠️ ${warning}`;
    wrapper.appendChild(warn);
  }

  const timestampDiv = document.createElement('div');
  timestampDiv.className = 'timestamp';
  timestampDiv.textContent = timestamp
    ? new Date(Number(timestamp)).toLocaleString()
    : '';

  const langLabel = document.createElement('div');
  langLabel.className = 'lang-label';
  langLabel.textContent = sourceLang && targetLang
    ? `${sourceLang} → ${targetLang}`
    : '';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = sender === 'me' || sender === 'you'
    ? 'You said:'
    : 'They said:';

  const originalWrapper = document.createElement('div');
  originalWrapper.className = 'original';
  if (original && original !== text) {
    originalWrapper.innerHTML = `<em>Corrected:</em> "${text}"<br>Original: "${original}"`;
  } else {
    originalWrapper.textContent = text || original || '';
  }

  const translated = document.createElement('div');
  translated.className = 'translated';
  translated.textContent = translation || '';

  wrapper.append(timestampDiv, langLabel, label, originalWrapper, translated);
  messagesContainer.appendChild(wrapper);
}
