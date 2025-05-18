import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import os from "os";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Transcribe raw audio buffer via Whisper
 * @param {Buffer} audioBuffer
 * @returns {Promise<string>}
 */

export async function transcribeAudio(audioBuffer) {
  const tempDir = os.tmpdir();
  const filename = `audio-${Date.now()}.webm`;
  const filepath = path.join(tempDir, filename);
  await fs.promises.writeFile(filepath, audioBuffer);

  try {
    const resp = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filepath),
      model: "whisper-1",
      response_format: "json" // ✅ Just omit 'language'
    });

    return { text: resp.text, detectedLang: resp.language || "en" };
  } finally {
    fs.promises.unlink(filepath).catch(() => {});
  }
}

/**
 * Translate text to the target language
 * @param {string} text
 * @param {string} targetLang  e.g. "es", "de"
 * @returns {Promise<string>}
 */
export async function translateText(text, targetLang) {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Translate the following to ${targetLang} (preserve meaning).`,
      },
      { role: "user", content: text },
    ],
  });
  return resp.choices[0].message.content;
}

export async function textToSpeech(text, voice = 'nova', model = 'tts-1') {
  try {
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64'); // Return as base64 string (e.g., for WebSocket)
  } catch (err) {
    console.error('🔊 TTS error:', err);
    return null;
  }
}
