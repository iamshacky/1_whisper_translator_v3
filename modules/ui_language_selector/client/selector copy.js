import { supportedLanguages } from './languages.js';
import { UILANG__STRINGS } from './translations.js';

let currentLang = 'en';

// --------------------------------------------------
// Language Preference Handling
// --------------------------------------------------
function getPreferredLanguage() {
  const stored = localStorage.getItem('ui_language');
  if (stored && UILANG__STRINGS[stored]) return stored;

  const browserLang = navigator.language?.slice(0, 2);
  return UILANG__STRINGS[browserLang] ? browserLang : 'en';
}

function saveLanguagePreference(lang) {
  localStorage.setItem('ui_language', lang);
  currentLang = lang;
}

// --------------------------------------------------
// Main Translation Updater
// --------------------------------------------------
function updateUIStrings(lang) {
  const strings = UILANG__STRINGS[lang];
  if (!strings) {
    console.warn(`⚠️ No UI translations found for "${lang}"`);
    return;
  }

  const el = (id) => document.getElementById(id);

  // ---------------------------
  // General UI
  // ---------------------------
  if (el('logout-btn')) el('logout-btn').innerText = strings.logout;
  if (el('textInput')) el('textInput').placeholder = strings.placeholder;
  if (el('send-btn')) el('send-btn').innerText = strings.send;
  if (el('delete-btn')) el('delete-btn').innerText = strings.delete;
  if (el('accept-btn')) el('accept-btn').innerText = strings.accept;
  if (el('previewTextBtn')) el('previewTextBtn').innerText = strings.previewTextBtn;

  if (el('current-room-display')) {
    const roomId = new URLSearchParams(window.location.search).get('room') || 'default';
    el('current-room-display').innerText = `${strings.roomLabel}: ${roomId}`;
  }

  // ---------------------------
  // modules/settings_panel
  // ---------------------------
  if (el('settings-header')) el('settings-header').innerText = strings.settings_header;
  if (el('cfg-targetLang-label')) el('cfg-targetLang-label').innerText = strings.cfg_targetLang_label;
  if (el('input-lang-mode-label')) el('input-lang-mode-label').innerText = strings.input_lang_mode_label;
  if (el('manual-input-lang-label')) el('manual-input-lang-label').innerText = strings.manual_input_lang_label;
  if (el('speech-mode-label')) el('speech-mode-label').innerText = strings.speech_mode_label;
  if (el('play-audio-on-label')) el('play-audio-on-label').innerText = strings.play_audio_on_label;
  if (el('cfg-save')) el('cfg-save').innerText = strings.save_btn;

  // ---------------------------
  // modules/moderation_engine
  // ---------------------------
  if (el('moderation-header')) el('moderation-header').innerText = strings.moderation_settings_header;
  if (el('correction-style-label')) el('correction-style-label').innerText = strings.correction_style_label;
  if (el('tone-style-label')) el('tone-style-label').innerText = strings.tone_style_label;
  if (el('persona-label')) el('persona-label').innerText = strings.persona_label;
  if (el('verbosity-label')) el('verbosity-label').innerText = strings.verbosity_label;
  if (el('auto-accept-label')) el('auto-accept-label').innerText = strings.auto_accept_label;
  if (el('moderation-settings-save')) el('moderation-settings-save').innerText = strings.save_btn;

  // ---------------------------
  // modules/persistence_sqlite/delete
  // ---------------------------
  if (el('expiration-header')) el('expiration-header').innerText = strings.msg_expiration_header;
  if (el('expire-after-label')) el('expire-after-label').innerText = strings.expire_after_label;
  if (el('save-expire-setting')) el('save-expire-setting').innerText = strings.save_btn;

  // ---------------------------
  // modules/translated_output_panel
  // ---------------------------
  if (el('output-header')) el('output-header').innerText = strings.output_settings_header;
  if (el('enable-my-output-lang-label')) el('enable-my-output-lang-label').innerText = strings.enable_my_output_lang;
  if (el('choose-output-lang-label')) el('choose-output-lang-label').innerText = strings.choose_output_lang;
  if (el('translated-output-save')) el('translated-output-save').innerText = strings.save_btn;

  // ---------------------------
  // modules/advanced_settings_panel
  // ---------------------------
  if (el('advanced-header')) el('advanced-header').innerText = strings.advanced_settings_header;
  if (el('show-warnings-label')) el('show-warnings-label').innerText = strings.show_warnings_label;
  if (el('show-warnings-yes')) el('show-warnings-yes').innerText = strings.show_warnings_yes;
  if (el('show-warnings-no')) el('show-warnings-no').innerText = strings.show_warnings_no;
  if (el('play-warning-audio-label')) el('play-warning-audio-label').innerText = strings.play_warning_audio_label;

  if (el('play-warning-audio-yes')) el('play-warning-audio-yes').innerText = strings.play_warning_audio_yes;
  if (el('play-warning-audio-no')) el('play-warning-audio-no').innerText = strings.play_warning_audio_no;

  if (el('adv-settings-save')) el('adv-settings-save').innerText = strings.save_btn;

  // ---------------------------
  // modules/room_manager_qr
  // ---------------------------
  if (el('room-manager-header')) el('room-manager-header').innerText = strings.room_manager_header;
  if (el('save-room-header')) el('save-room-header').innerText = strings.save_shared_room_header;
  if (el('your-rooms-header')) el('your-rooms-header').innerText = strings.your_rooms_header;
  if (el('create-room-btn')) el('create-room-btn').innerText = strings.create_room_btn;
  if (el('save-current-room-btn')) el('save-current-room-btn').innerText = strings.save_this_room_btn;
  if (el('save-room-status')) el('save-room-status').innerText = strings.save_room_status_saved;
  if (el('nickname-label')) el('nickname-label').innerText = strings.nickname_label;
  if (el('room-url-label')) el('room-url-label').innerText = strings.room_url_label;
  if (el('save-room-btn')) el('save-room-btn').innerText = strings.save_room_btn;

  // ---------------------------
  // Translate <option> elements with data-i18n-key
  // ---------------------------
  document.querySelectorAll('[data-i18n-key]').forEach(opt => {
    const key = opt.getAttribute('data-i18n-key');
    if (strings[key]) opt.textContent = strings[key];
  });
}

// --------------------------------------------------
// Language Selector UI
// --------------------------------------------------
function renderSelector(lang) {
  const container = document.getElementById('ui-language-selector-container');
  if (!container) return;

  const strings = UILANG__STRINGS[lang] || UILANG__STRINGS['en'];

  container.innerHTML = `
    <div id="ui-lang-toggle" style="cursor:pointer;">🌐</div>
    <div id="ui-lang-options" style="display:none; position:absolute; background:white; border:1px solid #ccc; padding:4px; z-index:9999;">
      ${supportedLanguages.map(langObj => {
        const labelText = strings[langObj.nameKey] || langObj.code;
        const flag = langObj.flagCode
          ? `<span class="fi fi-${langObj.flagCode}" style="margin-right:6px;"></span>`
          : '';
        return `<div class="ui-lang-option" data-lang="${langObj.code}" style="cursor:pointer; display:flex; align-items:center; gap:6px;">${flag}${labelText}</div>`;
      }).join('')}
    </div>
  `;

  const toggle = document.getElementById('ui-lang-toggle');
  const options = document.getElementById('ui-lang-options');

  toggle.onclick = () => {
    const isOpen = options.style.display === 'block';
    options.style.display = isOpen ? 'none' : 'block';
  };

  document.querySelectorAll('.ui-lang-option').forEach(option => {
    option.onclick = () => {
      const selectedLang = option.dataset.lang;
      saveLanguagePreference(selectedLang);
      updateUIStrings(selectedLang);
      renderSelector(selectedLang);
      options.style.display = 'none';

      // 🔔 Notify other panels to refresh
      document.dispatchEvent(new CustomEvent('ui-language-changed', {
        detail: { lang: selectedLang }
      }));
    };
  });
}

export function getCurrentUILang() {
  return currentLang || 'en';
}

// --------------------------------------------------
// Init
// --------------------------------------------------
export function UI_LANG_init() {
  const lang = getPreferredLanguage();
  currentLang = lang;
  renderSelector(lang);
  updateUIStrings(lang);

  // Re-run translation after a short delay to catch late-loaded panels
  setTimeout(() => updateUIStrings(currentLang), 1000);
}

document.addEventListener('DOMContentLoaded', UI_LANG_init);
