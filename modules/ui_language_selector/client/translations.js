// modules/ui_language_selector/client/translations.js
import en from './translations/en.js';
import es from './translations/es.js';
import fr from './translations/fr.js';
import de from './translations/de.js';
import ar from './translations/ar.js';

export const UILANG__STRINGS = { en, es, fr, de, ar };

// 🛠 Helper: lookup translated label by key
export function translateLabel(key, lang = 'en') {
  const dict = UILANG__STRINGS[lang] || UILANG__STRINGS['en'];
  return dict[key] || key;
}
