//import { translateLabel } from './translations.js';

import { UILANG__STRINGS } from './translations.js';

// modules/ui_language_selector/client/languages.js
export const supportedLanguages = [
  // Core
  { code: 'en', nameKey: 'lang_en', flagCode: 'us' },
  { code: 'es', nameKey: 'lang_es', flagCode: 'es' },
  { code: 'fr', nameKey: 'lang_fr', flagCode: 'fr' },
  { code: 'de', nameKey: 'lang_de', flagCode: 'de' },

  // Asian
  { code: 'zh', nameKey: 'lang_zh', flagCode: 'cn' },     // Simplified Chinese
  { code: 'zh_tw', nameKey: 'lang_zh_tw', flagCode: 'tw' }, // Traditional Chinese
  
  { code: 'ja', nameKey: 'lang_ja', flagCode: 'jp' },
  { code: 'ko', nameKey: 'lang_ko', flagCode: 'kr' },
  { code: 'hi', nameKey: 'lang_hi', flagCode: 'in' },
  { code: 'ar', nameKey: 'lang_ar', flagCode: 'sa' },
  { code: 'ne', nameKey: 'lang_ne', flagCode: 'np' },

  // European
  { code: 'it', nameKey: 'lang_it', flagCode: 'it' },
  { code: 'pt', nameKey: 'lang_pt', flagCode: 'pt' },
  { code: 'ru', nameKey: 'lang_ru', flagCode: 'ru' },
  { code: 'nl', nameKey: 'lang_nl', flagCode: 'nl' },
  { code: 'pl', nameKey: 'lang_pl', flagCode: 'pl' },

  // African
  { code: 'sw', nameKey: 'lang_sw', flagCode: 'ke' }, // Swahili (Kenya)
  { code: 'am', nameKey: 'lang_am', flagCode: 'et' }, // Amharic (Ethiopia)

  // Misc
  { code: 'tr', nameKey: 'lang_tr', flagCode: 'tr' },
  { code: 'fa', nameKey: 'lang_fa', flagCode: 'ir' },
  { code: 'bn', nameKey: 'lang_bn', flagCode: 'bd' },
  { code: 'ta', nameKey: 'lang_ta', flagCode: 'lk' },

  // Special
  { code: 'auto', nameKey: 'lang_auto', flagCode: null } // Auto-detect, no flag
];

export function populateLanguageSelect(selectEl, opts = {}) {
  const {
    includeAuto = false,
    includeBlank = false,
    preselected = null,
    uiLang = 'en'
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

    // 🔑 Use UI language strings if available, fallback to English
    const label =
      (UILANG__STRINGS[uiLang] && UILANG__STRINGS[uiLang][lang.nameKey]) ||
      (UILANG__STRINGS['en'] && UILANG__STRINGS['en'][lang.nameKey]) ||
      lang.code;

    opt.textContent = label;
    if (lang.code === preselected) opt.selected = true;
    selectEl.appendChild(opt);
  }
}