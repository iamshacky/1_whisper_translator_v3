
import { transcribeAudio, textToSpeech } from '../services/openaiService.js';
import { detectLanguage, translateText } from '../services/translationService.js';
import { SELECT_LANGUAGE_MODE, DEFAULT_INPUT_LANG } from '../config/settings.js';

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

    const sourceLang = SELECT_LANGUAGE_MODE ? DEFAULT_INPUT_LANG : await detectLanguage(transcriptText);
    const translated = await translateText(transcriptText, sourceLang, targetLang);

    const audioBase64 = await textToSpeech(translated, 'nova'); // 🔊 Generate TTS audio

    return {
      text: transcriptText,
      translation: translated,
      audio: audioBase64 || null
    };
  } catch (err) {
    console.error("Translation error:", err);
    throw err;
  }
}
