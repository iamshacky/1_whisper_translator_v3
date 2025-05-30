import express from 'express';
import { retranslateText } from './helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.post('/', async (req, res) => {
  const { text, targetLang } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const { translation, audio } = await retranslateText(text, targetLang);
    res.json({ translation, audio });
  } catch (err) {
    console.error("❌ Retranslation error:", err);
    res.status(500).json({ error: 'Retranslation failed.' });
  }
});

router.get('/ui', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

export default router;
