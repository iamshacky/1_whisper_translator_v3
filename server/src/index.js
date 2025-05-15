// server/src/index.js
import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import dotenv from 'dotenv';
import { setupWebSocket } from './controllers/wsHandler.js';
import { translateText, textToSpeech } from './services/openaiService.js';


dotenv.config();

// 1) Create your Express app
const app = express();

// 2) Parse JSON bodies for our translation endpoint
app.use(express.json());

// 3) Serve static assets and modules
app.use(express.static(path.resolve('client/public')));
app.use('/src',     express.static(path.resolve('client/src')));
app.use('/config',  express.static(path.resolve('config')));

// 4) Translation endpoint for edited text
/*
app.post('/api/translate-text', async (req, res) => {
  const { text, lang } = req.body;
  try {
    const translation = await translateText(text, lang);
    res.json({ translation });
  } catch (err) {
    console.error('❌ /api/translate-text error:', err);
    res.status(500).json({ error: err.toString() });
  }
});
*/
app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    const translation = await translateText(text, targetLang);
    const audio = await textToSpeech(translation);
    res.json({ translation, audio });
  } catch (err) {
    console.error('❌ Error in /api/translate-text:', err);
    res.status(500).json({ error: 'Translation failed' });
  }
});

// 5) Start HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on http://localhost:${PORT}`);
});

// 6) Hook up WebSocket server for Whisper transcription
server.on('upgrade', (req, socket, head) => {
  console.log('⏫ HTTP Upgrade for:', req.url);
});
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);
