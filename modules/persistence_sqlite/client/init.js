import {
  PS_saveMessage,
  PS_getAllMessages,
  PS_saveFinalMessage,
  renderMessageFromDb,
} from './helpers.js';

window.PS_saveMessage = PS_saveMessage;
window.PS_getAllMessages = PS_getAllMessages;
window.PS_saveFinalMessage = PS_saveFinalMessage;
window.PS_renderMessageFromDb = renderMessageFromDb;

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
