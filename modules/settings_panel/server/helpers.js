export function shouldWarn(inputLangMode, detectedLang, manualInputLang) {
  return inputLangMode === 'manual' && detectedLang !== manualInputLang;
}
