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

import { translateController } from './controllers/translate.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

//app.use(express.static(path.join(rootDir, 'client')));

/** 🔧 Core Middleware **/
app.use(express.json());
app.use(express.static(path.join(rootDir, 'client')));

/** 🔌 Modules & Plugins **/

// settings_panel
import settingsPanel from '../../modules/settings_panel/server/index.js';
app.use('/api/settings', settingsPanel);
app.use('/modules/settings-panel', express.static(path.join(rootDir, 'modules', 'settings_panel', 'client')));

// advanced_settings_panel
import advancedSettingsPanel from '../../modules/advanced_settings_panel/server/index.js';
app.use('/api/advanced-settings', advancedSettingsPanel);
app.use('/modules/advanced-settings-panel', express.static(path.join(rootDir, 'modules', 'advanced_settings_panel', 'client')));

// translated_output_panel
import translatedOutputModule from '../../modules/translated_output_panel/server/index.js';
app.use('/api/translated-output', translatedOutputModule);
app.use('/modules/translated_output_panel/client', express.static(
  path.join(rootDir, 'modules', 'translated_output_panel', 'client')
));

// persistence_sqlite
import persistenceSqliteRoutes from '../../modules/persistence_sqlite/server/routes.js';
app.use('/api/persistence-sqlite', persistenceSqliteRoutes);
app.use('/modules/persistence-sqlite', express.static(
  path.join(rootDir, 'modules', 'persistence_sqlite', 'client')
));




// Login module
app.get('/login', (_, res) => {
  res.sendFile(path.join(rootDir, 'modules', 'login', 'client', 'login.html'));
});

import loginRoutes from '../../modules/login/server/index.js';
app.use('/api/login', loginRoutes);
// login module static files
app.use('/modules/login', express.static(
  path.join(rootDir, 'modules', 'login', 'client')
));



import { shouldWarn } from '../../modules/settings_panel/server/helpers.js';

//const clients = new Set();
import { setupWebSocket } from './controllers/wsHandler.js';

setupWebSocket(wss);

app.post('/manual-translate', async (req, res) => {
  const { text, targetLang } = req.body;

  let finalLang = targetLang;
  let inputLangMode = 'auto';
  let manualInputLang = 'en';
  let showWarnings = true;

  try {
    const configRaw = await readFile(path.join(rootDir, 'modules', 'settings_panel', 'server', 'config.json'), 'utf-8');
    const config = JSON.parse(configRaw);
    finalLang = finalLang || config.targetLang || 'es';
    inputLangMode = config.inputLangMode || 'auto';
    manualInputLang = config.manualInputLang || 'en';

    // Try reading advanced settings
    try {
      const advRaw = await readFile(path.join(rootDir, 'modules', 'advanced_settings_panel', 'server', 'config.json'), 'utf-8');
      const advConfig = JSON.parse(advRaw);
      showWarnings = advConfig.showWarnings;
    } catch {
      showWarnings = true;
    }
  } catch {
    finalLang = finalLang || 'es';
  }

  try {
    const { detectLanguage, translateText } = await import('./services/translationService.js');
    const detectedLang = await detectLanguage(text);
    const translation = await translateText(text, detectedLang, finalLang);

    const warning = showWarnings && shouldWarn(inputLangMode, detectedLang, manualInputLang)
      ? `Expected "${manualInputLang}", but detected "${detectedLang}"`
      : '';

    res.json({ text, translation, audio: null, warning });
  } catch (err) {
    console.error('Manual translate error:', err);
    res.status(500).json({ error: 'Translation failed' });
  }
});



/* Before it was moved to index.html
import { buildModeratorPrompt } from '../../modules/moderation_engine/server/buildModeratorPrompt.js';
app.use('/moderation-settings', express.static(
  path.join(rootDir, 'modules', 'moderation_engine', 'client')
));
*/

import { buildModeratorPrompt } from '../../modules/moderation_engine/server/buildModeratorPrompt.js';
app.use('/modules/moderation_engine/client', express.static(
  path.join(rootDir, 'modules', 'moderation_engine', 'client')
));




app.post('/moderate-message', async (req, res) => {
  const {
    text,
    correctionMode = 'default',
    toneStyle = '',
    moderatorPersona = '',
    verbosity = ''
  } = req.body;

  console.log('🧠 Server moderation triggered for:', text);

  try {
    const messages = buildModeratorPrompt({
      text,
      correctionMode,
      toneStyle,
      persona: moderatorPersona,
      verbosity
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages
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



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
