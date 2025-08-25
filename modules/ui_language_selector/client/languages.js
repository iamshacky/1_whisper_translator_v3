import { translateLabel } from './translations.js';

// modules/ui_language_selector/client/languages.js
export const supportedLanguages = [
  // Core
  { code: 'en', nameKey: 'lang_en' },
  { code: 'es', nameKey: 'lang_es' },
  { code: 'fr', nameKey: 'lang_fr' },
  { code: 'de', nameKey: 'lang_de' },

  // Asian
  { code: 'zh', nameKey: 'lang_zh' },    // Chinese
  { code: 'ja', nameKey: 'lang_ja' },    // Japanese
  { code: 'ko', nameKey: 'lang_ko' },    // Korean
  { code: 'hi', nameKey: 'lang_hi' },    // Hindi
  { code: 'ar', nameKey: 'lang_ar' },    // Arabic
  { code: 'ne', nameKey: 'lang_ne' },    // Nepali

  // European
  { code: 'it', nameKey: 'lang_it' },    // Italian
  { code: 'pt', nameKey: 'lang_pt' },    // Portuguese
  { code: 'ru', nameKey: 'lang_ru' },    // Russian
  { code: 'nl', nameKey: 'lang_nl' },    // Dutch
  { code: 'pl', nameKey: 'lang_pl' },    // Polish

  // African
  { code: 'sw', nameKey: 'lang_sw' },    // Swahili
  { code: 'am', nameKey: 'lang_am' },    // Amharic

  // Misc
  { code: 'tr', nameKey: 'lang_tr' },    // Turkish
  { code: 'fa', nameKey: 'lang_fa' },    // Persian (Farsi)
  { code: 'bn', nameKey: 'lang_bn' },    // Bengali
  { code: 'ta', nameKey: 'lang_ta' },    // Tamil

  // Special
  { code: 'auto', nameKey: 'lang_auto' } // Auto-detect
];

// Populate <select> dynamically
export function populateLanguageSelect(selectEl, opts = {}) {
  const {
    includeAuto = false,
    includeBlank = false,
    preselected = null
  } = opts;

  // Clear previous options
  selectEl.innerHTML = '';

  if (includeBlank) {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '';
    selectEl.appendChild(blank);
  }

  for (const lang of supportedLanguages) {
    if (lang.code === 'auto' && !includeAuto) continue;

    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = translateLabel(lang.nameKey);  // 🔑 Dynamic label
    if (lang.code === preselected) opt.selected = true;
    selectEl.appendChild(opt);
  }
}
