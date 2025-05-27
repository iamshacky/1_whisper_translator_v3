
import { transcribeAudio, textToSpeech } from '../services/openaiService.js';
import { detectLanguage, translateText } from '../services/translationService.js';
import { SELECT_LANGUAGE_MODE, DEFAULT_INPUT_LANG } from '../config/settings.js';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Given an audio buffer and desired language, return both original text and translation
 * @param {Buffer} audioBuffer
 * @param {string} targetLang
 * @returns {Promise<{ text: string, translation: string, audio: string | null }> }
 */
export async function translateController(audioBuffer, targetLang, inputLangMode = 'auto', manualInputLang = 'en')
{
  try {
    const transcript = await transcribeAudio(audioBuffer); // 🧠 Whisper transcription
    if (!transcript) throw new Error("Failed to transcribe audio");

    console.log("📝 Raw transcript:", transcript);

    const transcriptText = typeof transcript === "string"
      ? transcript
      : transcript?.text || JSON.stringify(transcript);

    console.log("✅ Cleaned transcript text:", transcriptText);
    console.log("🧪 inputLangMode:", inputLangMode);
    console.log("🧪 manualInputLang:", manualInputLang);

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const rootDir = path.resolve(__dirname, '../../../');

    if (inputLangMode === 'manual') {
      console.log("🎯 Using MANUAL input lang:", manualInputLang);
    } else {
      console.log("🔍 Auto-detecting input language...");
    }
    
    /*
    const sourceLang = inputLangMode === 'manual'
      ? manualInputLang
      : await detectLanguage(transcriptText);
    */
    const sourceLang = inputLangMode === 'manual'
      ? (transcript.detectedLang || manualInputLang)
      : await detectLanguage(transcriptText);

    const translated = await translateText(transcriptText, sourceLang, targetLang);

    const audioBase64 = await textToSpeech(translated, 'nova'); // 🔊 Generate TTS audio

    return {
      text: transcriptText,
      translation: translated,
      audio: audioBase64 || null,
      detectedLang: transcript.detectedLang
    };
  } catch (err) {
    console.error("Translation error:", err);
    throw err;
  }
}
