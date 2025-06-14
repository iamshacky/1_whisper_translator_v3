console.log("✅ PS_helpers loaded");

export function PS_getRoom() {
  return new URLSearchParams(window.location.search).get("room") || "default";
}

export function PS_saveMessage(msg) {
  /*
  fetch("/api/persistence-sqlite/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  }).catch((err) => {
    console.error("❌ Failed to save message:", err);
  });
  */
  fetch('/api/persistence-sqlite/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: msg.room,
      original: msg.original,
      translation: msg.translation,
      warning: msg.warning,
      sourceLang: msg.sourceLang,
      targetLang: msg.targetLang,
      timestamp: msg.timestamp,
      audio: msg.audio,
      user: {
        user_id: msg.user_id,
        username: msg.username
      }
    })
  });
}

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
  const user = JSON.parse(localStorage.getItem("whisper-user"));
  if (!user || !user.user_id) {
    console.warn("❌ No logged-in user found. Message not saved.");
    return;
  }

  // 🛡️ Check if this message belongs to the current user
  if (data.user_id !== user.user_id) {
    console.log("🛑 Not saving — this message is from another user.");
    return;
  }

  const room = PS_getRoom();

  const msg = {
    room,
    user_id: user.user_id,
    username: user.username,
    original: data.original || data.text,
    translation: data.translation || "",
    warning: data.warning || "",
    sourceLang: data.sourceLang || "",
    targetLang: data.targetLang || "",
    timestamp: Date.now(),
    audio: data.audio || null
  };

  PS_saveMessage(msg);
  return 'saved';
}

/*
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
    user_id,
    username
  } = msg;

  const loggedInUser = JSON.parse(localStorage.getItem("whisper-user") || '{}');
  const senderIsCurrentUser = loggedInUser?.user_id === user_id;

  // ✅ Only save if current user sent it
  if (!senderIsCurrentUser) return;

  console.log("🟦 RENDERING MESSAGE:");
  console.log("   loggedInUser:", loggedInUser);
  console.log("   msg.user_id :", user_id);
  console.log("   senderIsCurrentUser:", senderIsCurrentUser);

  const wrapper = document.createElement('div');
  wrapper.className = `msg ${senderIsCurrentUser ? 'me' : 'they'}`;

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

  const displayName = username?.trim?.() || 'Someone';
  label.textContent = senderIsCurrentUser
    ? 'You said:'
    : `${displayName} said:`;

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
    user_id,
    username
  } = msg;

  const loggedInUser = JSON.parse(localStorage.getItem("whisper-user") || '{}');
  const senderIsCurrentUser = loggedInUser?.user_id === user_id;

  console.log("🟦 RENDERING MESSAGE:");
  console.log("   loggedInUser:", loggedInUser);
  console.log("   msg.user_id :", user_id);
  console.log("   senderIsCurrentUser:", senderIsCurrentUser);

  const wrapper = document.createElement('div');
  wrapper.className = `msg ${senderIsCurrentUser ? 'me' : 'they'}`;

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

  const displayName = username?.trim?.() || 'Someone';
  label.textContent = senderIsCurrentUser
    ? 'You said:'
    : `${displayName} said:`;

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
