// server/src/services/translationService.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Detect the language of a given text using the Responses API
 * @param {string} text
 * @returns {Promise<string>} ISO 639-1 code like "en", "es"
 */
function extractTextFromResponse(response) {
  const output = response.output?.[0];
  const content = output?.content?.find(c => c.type === "output_text");
  if (!content || !content.text) {
    throw new Error("Unexpected response format from OpenAI.");
  }
  return content.text.trim();
}

export async function detectLanguage(text) {
  const prompt = `What is the ISO 639-1 language code for this sentence: "${text}"? Respond with only the code.`;

  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [{ role: "user", content: prompt }]
  });

  const code = extractTextFromResponse(response).toLowerCase();
  if (!code || code.length !== 2) {
    throw new Error(`Language detection failed. Got: "${code}"`);
  }

  return code;
}

/**
 * Translate text using the Responses API
 * @param {string} text
 * @param {string} sourceLang
 * @param {string} targetLang
 * @returns {Promise<string>}
 */
export async function translateText(text, sourceLang, targetLang) {
  const prompt = `Translate from ${sourceLang} to ${targetLang}:\n\n${text}`;

  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [{ role: "user", content: prompt }]
  });

  return extractTextFromResponse(response);
}
