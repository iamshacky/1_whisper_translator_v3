// modules/moderation_engine/server/buildModeratorPrompt.js

export function buildModeratorPrompt({ text, correctionMode = 'default', toneStyle = '', persona = '', verbosity = '' }) {
  let systemPrompt = '';
  let toneFlavor = '';
  let personaFlavor = '';
  let verbosityNote = '';

  // 🧠 Main correction logic
  switch (correctionMode) {
    case 'make_smarter':
      systemPrompt = "You improve grammar, clarity, and word choice in spoken text.";
      break;
    case 'strict':
      systemPrompt = "You rewrite transcriptions to remove all vulgarity or rudeness.";
      break;
    case 'silly_filter':
      systemPrompt = "You replace offensive words with silly alternatives like 'sugar', 'gosh darn', or 'whoopsie-doodle' that translate well so that meaning doesn't get lost.";
      break;
    default:
      systemPrompt = "You check if a Whisper transcription is accurate. If it's fine, reply with 'ok'. If not, suggest a better version.";
  }

  // ✨ Optional tone overlay
  switch (toneStyle) {
    case 'polite_mode':
      toneFlavor = "You rewrite sentences to sound more polite and diplomatic.";
      break;
    case 'dramatic':
      toneFlavor = "You reword text to sound dramatic and passionate. Exaggerate emotions while keeping the message understandable.";
      break;
  }

  // 🎭 Optional persona overlay
  switch (persona) {
    case 'wizard':
      personaFlavor = "Speak like a medieval wizard. Use words like 'thou' and 'hath'.";
      break;
    case 'professor':
      personaFlavor = "Speak like a university professor, using formal and scholarly tone.";
      break;
    case 'goose':
      personaFlavor = "Speak like a silly goose. Add playful phrases and sound a bit ridiculous.";
      break;
  }

  // 📝 Optional verbosity modifier
  switch (verbosity) {
    case 'brief':
      verbosityNote = "Be as short and concise as possible.";
      break;
    case 'verbose':
      verbosityNote = "Add detailed, expressive phrasing even for simple ideas.";
      break;
    case 'extremely_verbose':
      verbosityNote = "Add detailed, expressive phrasing even for simple ideas. If there isn't enough in the original meaning to do that and make the sentence at least 20 words long, then use filler words like 'um, uh, or something similar.";
      break;
  }

  const fullPrompt = [
    systemPrompt,
    toneFlavor,
    personaFlavor,
    verbosityNote
  ].filter(Boolean).join(" ");

  return [
    { role: "system", content: fullPrompt },
    { role: "user", content: `Transcription: "${text}"` }
  ];
}
