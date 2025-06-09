import {
  PSN_saveMessage,
  PSN_getMessages,
  PSN_saveFinalMessage
} from './helpers.js';

window.PSN_saveMessage = PSN_saveMessage;
window.PSN_getMessages = PSN_getMessages;
window.PSN_saveFinalMessage = PSN_saveFinalMessage;

console.log("✅ PSN_init.js (session mode) loaded");

// Optional: prompt for username (stored only for this session)
let username = sessionStorage.getItem("username") || "";
if (!username) {
  username = prompt("Enter your name (optional):") || "";
  sessionStorage.setItem("username", username);
}
window.PSN_username = username;

const PSN_renderedMessages = new Set();

function PSN_isDuplicate(msg) {
  return PSN_renderedMessages.has(`${msg.timestamp}_${msg.original}`);
}
function PSN_markAsRendered(msg) {
  PSN_renderedMessages.add(`${msg.timestamp}_${msg.original}`);
}

document.addEventListener("DOMContentLoaded", async () => {
  const messages = PSN_getMessages();

  const waitForAddMessage = async () => {
    while (typeof window.addMessage !== "function") {
      await new Promise((r) => setTimeout(r, 50));
    }

    messages.forEach((msg) => {
      if (PSN_isDuplicate(msg)) return;

      const sender = msg.sender === "me" ? "me" : "they";

      addMessage({
        ...msg,
        sender
      });

      PSN_markAsRendered(msg);
    });
  };

  waitForAddMessage();
});
