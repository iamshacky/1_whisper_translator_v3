import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function extractTextFromResponse(response) {
  const output = response.output?.[0];
  const content = output?.content?.find(c => c.type === "output_text");
  if (!content || !content.text) {
    throw new Error("Unexpected response format from OpenAI.");
  }
  return content.text.trim();
}

export async function retranslateText(text, targetLang) {
  const prompt = `Translate this to ${targetLang}: ${text}`;

  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [{ role: "user", content: prompt }]
  });

  const translation = extractTextFromResponse(response);

  // Optional: Add audio TTS
  let audio = null;
  try {
    const tts = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: translation
    });
    const buffer = Buffer.from(await tts.arrayBuffer());
    audio = buffer.toString('base64');
  } catch (err) {
    console.warn("🔇 Failed to synthesize audio:", err);
  }

  return { translation, audio };
}
