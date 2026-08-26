export const getLocaleLabel = ({
  code,
  displayLocale,
  translate,
  DisplayNames = globalThis.Intl?.DisplayNames,
}) => {
  if (code === 'ru-RU') return translate('language.russian');
  if (code === 'en-EN') return translate('language.english');

  try {
    if (typeof DisplayNames === 'function') {
      const languageName = new DisplayNames(
        [displayLocale.split('-')[0]],
        { type: 'language' },
      ).of(code.split('-')[0]);
      if (languageName) return `${languageName} (${code})`;
    }
  } catch {
    // Intl.DisplayNames is optional in some React Native runtimes.
  }

  return translate('language.localeCode').replace('{code}', code);
};
