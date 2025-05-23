﻿import express from 'express';
import { readFile } from 'fs/promises';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

import { translateController } from './controllers/translate.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

app.use(express.static(path.join(rootDir, 'client')));


/** 🔧 Core Middleware **/
app.use(express.json());
app.use(express.static(path.join(rootDir, 'client')));

/** 🔌 Modules & Plugins **/

// settings_panel module
import settingsPanel from '../../modules/settings_panel/server/index.js';
app.use('/api/settings', settingsPanel);
app.use('/plugin/settings-panel', express.static(
  path.join(rootDir, 'modules', 'settings_panel', 'client')
));

//const clients = new Set();
import { setupWebSocket } from './controllers/wsHandler.js';

setupWebSocket(wss);

app.post('/manual-translate', async (req, res) => {
  const { text, targetLang } = req.body;

  let finalLang = targetLang;
  if (!finalLang) {
    // Fallback to config
    try {
      const configRaw = await readFile(path.join(rootDir, 'modules', 'settings_panel', 'server', 'config.json'), 'utf-8');
      const config = JSON.parse(configRaw);
      finalLang = config.targetLang || 'es';
    } catch {
      finalLang = 'es';
    }
  }

  try {
    const { detectLanguage, translateText } = await import('./services/translationService.js');
    const sourceLang = await detectLanguage(text);
    const translation = await translateText(text, sourceLang, finalLang);

    res.json({ text, translation, audio: null });
  } catch (err) {
    console.error('Manual translate error:', err);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.post('/moderate-message', async (req, res) => {
  const { text } = req.body;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that checks if a Whisper transcription is accurate. If it's not, suggest a correction. If it's fine, say 'ok'."
        },
        {
          role: "user",
          content: `Transcription: "${text}"`
        }
      ]
    });

    const reply = response.choices?.[0]?.message?.content?.trim() || "";

    console.log(`🧠 Moderator input: "${text}"`);
    console.log(`🧠 Moderator response: "${reply}"`);

    if (reply.toLowerCase().startsWith("ok")) {
      return res.json({ needsCorrection: false });
    } else {
      return res.json({ needsCorrection: true, suggestedText: reply });
    }

  } catch (err) {
    console.error('GPT moderation error:', err);
    return res.status(500).json({ needsCorrection: false });
  }
});

app.get('/', (_, res) => {
  res.sendFile(path.join(rootDir, 'client', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
