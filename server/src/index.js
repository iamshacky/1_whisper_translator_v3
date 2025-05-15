import express from 'express';
import { readFile } from 'fs/promises';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

// Static serving
app.use(express.static(path.join(rootDir, 'client')));
app.use('/src', express.static(path.join(rootDir, 'client', 'src')));
app.use(express.json());

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'retranslate') {
        // future enhancement
        return;
      }

      const outbound = {
        type: 'final',
        text: data.text,
        translation: data.translation,
        audio: data.audio,
      };

      for (const client of clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(outbound));
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => clients.delete(ws));
});

app.post('/moderate-message', async (req, res) => {
  const { text } = req.body;

  try {
    const prompt = `Check this transcription for likely speech recognition errors. Suggest a correction if needed.\n\nTranscription: "${text}"\n\nIf the transcription is fine, say "ok".`;

    const chat = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = chat.choices[0]?.message?.content || '';
    if (reply.toLowerCase().startsWith('ok')) {
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
