﻿import { transcribeAudio, textToSpeech } from '../services/openaiService.js';
import { detectLanguage, translateText } from '../services/translationService.js';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Given an audio buffer and desired language, return both original text and translation
 * @param {Buffer} audioBuffer
 * @param {string} targetLang
 * @returns {Promise<{ text: string, translation: string, audio: string | null }> }
 */
export async function translateController(audioBuffer, targetLang) {
  try {
    const transcript = await transcribeAudio(audioBuffer); // 🧠 Whisper transcription
    if (!transcript) throw new Error("Failed to transcribe audio");

    console.log("📝 Raw transcript:", transcript);

    const transcriptText = typeof transcript === "string"
      ? transcript
      : transcript?.text || JSON.stringify(transcript);

    console.log("✅ Cleaned transcript text:", transcriptText);

    let sourceLang;
    try {
      const configPath = path.join(process.cwd(), 'modules', 'settings_panel', 'server', 'config.json');
      const configRaw = await readFile(configPath, 'utf-8');
      const config = JSON.parse(configRaw);

      if (config.selectInputLang && config.inputLang) {
        sourceLang = config.inputLang;
        console.log(`🌍 Using manually selected input language: ${sourceLang}`);
      } else {
        sourceLang = await detectLanguage(transcriptText);
        console.log(`🧠 Detected input language: ${sourceLang}`);
      }
      console.log(`🎯 Final sourceLang used: ${sourceLang}`);
    } catch (err) {
      console.warn("⚠️ Could not read input language config, falling back to auto detect");
      sourceLang = await detectLanguage(transcriptText);
    }

    const translated = await translateText(transcriptText, sourceLang, targetLang);
    const audioBase64 = await textToSpeech(translated, 'nova'); // 🔊 Generate TTS audio
    
    /*
    return {
      text: transcriptText,
      translation: translated,
      audio: audioBase64 || null
    };
    */
    return {
      text: transcriptText,
      translation: translated,
      audio: audioBase64 || null,
      sourceLang
    };
  } catch (err) {
    console.error("Translation error:", err);
    throw err;
  }
}
