
export function setupReTranslationHook() {
  const waitForAddMessage = setInterval(() => {
    if (typeof window.addMessage === 'function') {
      clearInterval(waitForAddMessage);

      const originalAddMessage = window.addMessage;

      window.addMessage = async function (msg) {
        const settings = JSON.parse(localStorage.getItem('translated-output-settings') || '{}');

        const shouldOverride =
          settings.enabled &&
          settings.lang &&
          msg.sender === 'they' &&
          msg.text;

        if (shouldOverride) {
          try {
            const response = await fetch('/api/translated-output', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: msg.text,
                targetLang: settings.lang
              })
            });

            const { translation, audio } = await response.json();
            if (translation) {
              msg.translation = translation;
              msg.lang = `${msg.sourceLang || 'auto'} → ${settings.lang}`;
            }

            if (audio) {
              msg.audio = audio;
            }

            console.log('🔁 Re-translated message:', translation);
          } catch (err) {
            console.warn('⚠️ Failed to retranslate:', err);
          }
        }

        originalAddMessage(msg);
      };

      console.log('🔁 Retranslation hook activated.');
    }
  }, 100); // Check every 100ms until ready
}
