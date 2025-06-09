console.log("✅ PSN_helpers.js (session mode) loaded");

export function PSN_saveMessage(msg) {
  const messages = JSON.parse(sessionStorage.getItem("psn_messages") || "[]");
  messages.push(msg);
  sessionStorage.setItem("psn_messages", JSON.stringify(messages));
}

export function PSN_getMessages() {
  return JSON.parse(sessionStorage.getItem("psn_messages") || "[]");
}

export function PSN_saveFinalMessage(data) {
  const room = new URLSearchParams(window.location.search).get("room") || "default";
  const username = sessionStorage.getItem("username") || "";
  const deviceId = "session_" + (username || "anon");

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

  PSN_saveMessage(msgToSave);
}
