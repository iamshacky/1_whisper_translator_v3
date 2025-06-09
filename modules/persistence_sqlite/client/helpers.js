console.log("✅ PS_helpers loaded");

export function PS_saveMessage(msg) {
  fetch("/api/persistence-sqlite/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  }).catch((err) => {
    console.error("❌ Failed to save message:", err);
  });
}

export function PS_getAllMessages(room) {
  return fetch(`/api/persistence-sqlite/messages?room=${room}`)
    .then((res) => res.json())
    .catch((err) => {
      console.error("❌ Failed to load messages:", err);
      return [];
    });
}

/*
export function PS_saveFinalMessage(data) {
  const room = new URLSearchParams(window.location.search).get("room") || "default";
  const deviceId = window.PS_myDeviceId || localStorage.getItem("deviceId");

  const msgToSave = {
    room,
    deviceId,
    sender: data.speaker === "you" ? "me" : "they",
    original: data.original || data.text,
    translation: data.translation || "",
    warning: data.warning || "",
    sourceLang: data.sourceLang || "",
    targetLang: data.targetLang || "",
    timestamp: Date.now(),
  };

  PS_saveMessage(msgToSave);
}
*/
export function PS_saveFinalMessage(data) {
  const room = new URLSearchParams(window.location.search).get("room") || "default";
  const deviceId = window.PS_myDeviceId || localStorage.getItem("deviceId");

  const msgToSave = {
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

  PS_saveMessage(msgToSave);

  // ✅ Return sender so index.js can use it in addMessage
  return msgToSave.sender;
}

