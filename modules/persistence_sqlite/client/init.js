import {
  PS_saveMessage,
  PS_getAllMessages,
  PS_saveFinalMessage
} from './helpers.js';

window.PS_saveMessage = PS_saveMessage;
window.PS_getAllMessages = PS_getAllMessages;
window.PS_saveFinalMessage = PS_saveFinalMessage;

console.log("✅ PS_init.js loaded");

function PS_generateOrLoadDeviceId() {
  let deviceId = localStorage.getItem("deviceId");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("deviceId", deviceId);
  }
  return deviceId;
}

const PS_myDeviceId = PS_generateOrLoadDeviceId();
window.PS_myDeviceId = PS_myDeviceId;

// Optional: dev banner
const devBanner = document.createElement("div");
devBanner.innerText = `🆔 ${PS_myDeviceId.slice(0, 6)}...`;
devBanner.style = "position: fixed; top: 0; right: 0; font-size: 12px; background: #eee; padding: 2px 6px;";
document.body.appendChild(devBanner);

// 🧠 Deduplication logic (shared across live + reload)
const PS_renderedMessages = new Set();

function PS_isDuplicate(message) {
  return PS_renderedMessages.has(`${message.timestamp}_${message.deviceId}`);
}

function PS_markAsRendered(message) {
  PS_renderedMessages.add(`${message.timestamp}_${message.deviceId}`);
}

window.PS_renderedMessages = PS_renderedMessages;
window.PS_isDuplicate = PS_isDuplicate;
window.PS_markAsRendered = PS_markAsRendered;

document.addEventListener("DOMContentLoaded", async () => {
  const room = new URLSearchParams(window.location.search).get("room") || "default";
  const myDeviceId = window.PS_myDeviceId;

  const messages = await PS_getAllMessages(room);
  console.log(`🕓 PS_loaded ${messages.length} messages from "${room}"`);

  const waitForAddMessage = async () => {
    while (typeof window.addMessage !== "function") {
      await new Promise((r) => setTimeout(r, 50));
    }

    messages.forEach((msg) => {
      if (PS_isDuplicate(msg)) {
        console.log(`🚫 Skipping duplicate msg from ${msg.deviceId} at ${msg.timestamp}`);
        return;
      }

      const speaker = msg.deviceId === myDeviceId ? 'me' : 'they';
      console.log(`📦 Message from DB:`, msg);
      console.log(`🆔 Comparing deviceId: ${msg.deviceId} vs myDeviceId: ${myDeviceId}`);
      console.log(`🎭 Determined speaker: ${speaker}`);

      addMessage({
        ...msg,
        sender: speaker
      });

      PS_markAsRendered(msg);
    });
  };

  waitForAddMessage();
});
