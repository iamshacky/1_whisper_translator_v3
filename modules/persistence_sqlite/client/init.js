// modules/persistence_sqlite/client/init.js
import {
  PS_saveMessage,
  PS_getAllMessages,
  PS_saveFinalMessage
} from './helpers.js';

window.PS_saveMessage = PS_saveMessage;
window.PS_getAllMessages = PS_getAllMessages;
window.PS_saveFinalMessage = PS_saveFinalMessage;

console.log("✅ PS_init loaded");

document.addEventListener("DOMContentLoaded", async () => {
  const room = new URLSearchParams(window.location.search).get("room") || "default";
  const currentDeviceId = window.myDeviceId || localStorage.getItem("deviceId");

  const messages = await PS_getAllMessages(room);
  console.log(`🕓 PS_loaded ${messages.length} messages from "${room}"`);

  const waitForAddMessage = async () => {
    while (typeof window.addMessage !== "function") {
      await new Promise((r) => setTimeout(r, 50));
    }

    const myDeviceId = localStorage.getItem('deviceId');

    messages.forEach((msg) => {
      console.log(`📦 Message from DB:`, msg);
      console.log(`🆔 Comparing deviceId: ${msg.deviceId} vs myDeviceId: ${myDeviceId}`);

      const speaker = msg.deviceId === myDeviceId ? 'me' : 'they';
      console.log(`🎭 Determined speaker: ${speaker}`);

      addMessage({
        ...msg,
        sender: speaker, // 🟩 update sender based on deviceId comparison
      });
    });
  };

  waitForAddMessage();
});
