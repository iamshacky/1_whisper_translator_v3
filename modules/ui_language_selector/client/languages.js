import { translateLabel } from './translations.js';

// modules/ui_language_selector/client/languages.js
export const supportedLanguages = [
  { code: 'en', nameKey: 'lang_en' },
  { code: 'es', nameKey: 'lang_es' },
  { code: 'fr', nameKey: 'lang_fr' },
  { code: 'de', nameKey: 'lang_de' },
  { code: 'zh', nameKey: 'lang_zh' },
  { code: 'ne', nameKey: 'lang_ne' },
  { code: 'sw', nameKey: 'lang_sw' },
  { code: 'auto', nameKey: 'lang_auto' }
  // Add more...
];



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
