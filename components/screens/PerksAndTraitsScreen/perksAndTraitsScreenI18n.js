import ruPerksAndTraitsScreen from '../../../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../../../i18n/en-EN/screens/perksAndTraits/screen.json';
import { getCurrentLocale } from '../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': ruPerksAndTraitsScreen,
  'en-EN': enPerksAndTraitsScreen,
};

export const tPerksAndTraits = (path, fallback = '') => {
  const parts = path.split('.');
  const locale = getCurrentLocale();
  let current = DICTIONARIES[locale] || ruPerksAndTraitsScreen;

  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return fallback || 'Ошибка ключа';
  }

  return current;
};
