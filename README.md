
# 🗣️ Whisper Translator v3

Works good.

**Real-time, voice-to-voice multilingual translator for collaborative environments** — powered by OpenAI Whisper, GPT-4o, and WebSockets. Built for warehouses, teams, and everyday cross-language conversations.

## 🚀 Features

* 🎙️ **Voice Input**: Speak in your preferred language. Transcription powered by Whisper.
* 🌐 **Auto / Manual Language Detection**: Choose between auto-detect or manually select input languages (e.g. English → Spanish).
* 🧠 **GPT-Powered Moderator**:

  * Detects unclear phrases.
  * Suggests corrections ("Did you mean...?")
  * Warns when the spoken language doesn't match settings.
* ⚠️ **Input Language Warnings**: Get notified if you spoke in the wrong language (e.g. "Expected French, but detected English").
* 🗯️ **Multiplayer Messaging**: Send translated messages to other devices in the same room (`room=warehouse`, etc).
* 🔁 **Audio Playback Options**: Choose who hears the audio (Sender, Receiver, Both, or None).
* 📱 **Mobile-Friendly UI**: Fully responsive, ideal for use on the warehouse floor or in the field.
* 🔧 **Settings Panel**: Modify translation behavior per device — with live-saving.

## 🏗️ Stack

* **Frontend**: Vanilla JS, WebSocket, Whisper-based recorder, GPT moderation, inline preview.
* **Backend**: Node.js (Express + WebSocket), OpenAI APIs (Whisper, GPT-4o, TTS), simple JSON config storage.
* **API Usage**:

  * `POST /moderate-message`: Uses GPT-4o to optionally rephrase or reject messages.
  * Whisper + GPT used for each voice input → transcript → translation → speech.

## 📸 Sample Use Cases

* 🧑‍🏭 Warehouse with multilingual staff
* 🏥 Hospital team members with limited shared language
* 👷 Construction crew using headset-based communication
* ✈️ Airport tarmac operations
* 🛠️ As a framework for hands-free voice-based LLM workflows

## 📂 Project Structure

```
1_whisper_translator_v3/
│
├── client/               # Web UI
│   └── src/
│       └── index.js      # WebSocket handling, message logic
│
├── server/
│   └── src/
│       ├── controllers/
│       │   ├── wsHandler.js
│       │   └── translate.js
│       ├── services/
│       │   └── openaiService.js
│       └── index.js      # WebSocket + Express setup
│
├── modules/
│   └── settings_panel/   # UI for local settings
│       ├── client/ui.js
│       └── server/panel.html
│
└── uploads/              # Temporarily holds audio blobs
```

## 🔮 Roadmap

* [x] Warn when wrong language is spoken
* [x] Multi-device sync via WebSocket
* [x] Preview moderation and message approval
* [ ] Display language pairs (e.g. "en → es")
* [ ] Per-device target language
* [ ] Whisper transcription logs (optional)
* [ ] WebRTC / voice calls
* [ ] GPT agent that coordinates tasks or issues
* [ ] "Solo mode" for one-device use (like a walkie-talkie with instant GPT help)

## 🔒 Privacy / Notes

* No transcripts or audio are permanently stored.
* Whisper + GPT are used live via OpenAI APIs. You control all output.
* Meant for **personal, internal, or low-scale team use**. Not commercial-grade yet.

## 📦 Install / Deploy (Locally)

1. Clone the repo.
2. `cd 1_whisper_translator_v3`
3. `npm install`
4. Add your OpenAI API key to `.env`
5. Run: `npm run dev`
6. Visit: `http://localhost:3000/?room=warehouse`

## 📡 Live Deployment (Optional)

Deployed at:
🔗 [https://1whispertranslatorv3-production.up.railway.app/?room=warehouse](https://1whispertranslatorv3-production.up.railway.app/?room=warehouse)

---

**Built with 🛠️ love and 🎤 frustration by humans who just want to talk to each other — even when they don’t speak the same language.**

---
