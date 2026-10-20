import ruPerksAndTraitsScreen from '../../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../../i18n/en-EN/screens/perksAndTraits/screen.json';
import { getCurrentModuleLocale } from '../../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': ruPerksAndTraitsScreen,
  'en-EN': enPerksAndTraitsScreen,
};

export const tPerksAndTraits = (path) => {
  // The Fallout package owns this screen's complete locale dictionary.
  let current = DICTIONARIES[getCurrentModuleLocale()];
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
