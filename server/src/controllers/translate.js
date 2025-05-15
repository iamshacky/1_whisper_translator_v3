
import { transcribeAudio, translateText } from '../services/openaiService.js';

/**
 * Given an audio buffer and desired language, return both original text and translation
 * @param {Buffer} audioBuffer
 * @param {string} targetLang
 * @returns {Promise<{ text: string, translation: string, audio: string }>}
 */

import { textToSpeech } from '../services/openaiService.js';

// server/src/controllers/translate.js
export async function translateController(audioBuffer, targetLang = 'es') {
  const text        = await transcribeAudio(audioBuffer);
  const translation = await translateText(text, targetLang);
  const audio       = await textToSpeech(translation);

  console.log("→ [translateController] text:", text);
  console.log("→ [translateController] translation:", translation);
  if (audio) {
    console.log("→ [translateController] audio length:", audio.length);
  } else {
    console.warn("⚠️ [translateController] no audio returned from TTS");
  }

  return { text, translation, audio };
}
