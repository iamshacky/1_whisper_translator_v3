Perfect — here are both files ready to drop into your project:

---

### ✅ `README.md`

````markdown
# Whisper Translator v3

A hands-free, real-time voice-to-voice translator powered by OpenAI's Whisper and GPT-4o. Designed for multilingual environments like warehouses and workplaces.

## 🌐 Live Demo

I don't want to put the url because if a lot of people test it it could cost me money. I'll post a video later to demo it. You can also just deploy this yourself.

## 🔧 Features

- 🎙️ Voice input with Whisper transcription
- 🌍 Instant translation via GPT-4o
- 🔈 Auto-generated speech with OpenAI TTS
- 🤖 GPT moderation for speech errors (e.g., "Did you mean...")
- 📱 Real-time sync across devices using WebSockets
- ⏱️ Timestamps + language labels
- 👂 Auto-play audio on receive — no clicking needed
- 🔄 Re-translate or delete preview before sending

## 📦 Setup

```bash
# clone the repo
git clone https://github.com/YOUR_USERNAME/1whispertranslator-v3.git
cd 1whispertranslator-v3

# install dependencies
npm install

# start server (adjust for Railway or local needs)
node server.js
````

## 🚀 Deployment

Deployed on [Railway](https://railway.app/) using Node.js.

## 🔐 Environment Variables

Create a `.env` file in the root with the following:

```env
OPENAI_API_KEY=your-openai-api-key
```

## 🛠 Project Structure

```
client/         # Frontend files (HTML/CSS/JS)
server/         # WebSocket and transcription backend
server.js       # Alt version of the backend (standalone variant)
config/         # Language settings
```

## 📄 License

MIT

````

---
