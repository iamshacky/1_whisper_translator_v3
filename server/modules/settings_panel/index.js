// server/modules/settings_panel/index.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import defaults from './defaults.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { ...defaults };
  }
}

function saveConfig(newConfig) {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
}

router.get('/', (req, res) => {
  res.json(loadConfig());
});

router.patch('/', (req, res) => {
  const newSettings = { ...loadConfig(), ...req.body };
  saveConfig(newSettings);
  res.json({ success: true, config: newSettings });
});

export default router;
