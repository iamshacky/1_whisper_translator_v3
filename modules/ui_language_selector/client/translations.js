// modules/ui_language_selector/client/translations.js
import en from './translations/en.js';
import es from './translations/es.js';
import fr from './translations/fr.js';
import de from './translations/de.js';
import ar from './translations/ar.js';
import ja from './translations/ja.js';
import ko from './translations/ko.js';
import hi from './translations/hi.js';
import it from './translations/it.js';
import pt from './translations/pt.js';
import ru from './translations/ru.js';
import nl from './translations/nl.js';
import pl from './translations/pl.js';
import am from './translations/am.js';
import tr from './translations/tr.js';
import fa from './translations/fa.js';
import bn from './translations/bn.js';
import ta from './translations/ta.js';
import zh from './translations/zh.js';
import zh_tw from './translations/zh_tw.js';
import ne from './translations/ne.js';
import sw from './translations/sw.js';

export const UILANG__STRINGS = {
  'en': en,
  'es': es,
  'fr': fr,
  'de': de,
  'ar': ar,
  'ja': ja,
  'ko': ko,
  'hi': hi,
  'it': it,
  'pt': pt,
  'ru': ru,
  'nl': nl,
  'pl': pl,
  'am': am,
  'tr': tr,
  'fa': fa,
  'bn': bn,
  'ta': ta,
  'zh': zh,
  'zh_tw': zh_tw,  // ✅ match languages.js code
  'ne': ne,
  'sw': sw
};

// Helper: lookup translated label by key
export function translateLabel(key, lang = 'en') {
  const dict = UILANG__STRINGS[lang] || UILANG__STRINGS['en'];
  return dict[key] || key;
}
