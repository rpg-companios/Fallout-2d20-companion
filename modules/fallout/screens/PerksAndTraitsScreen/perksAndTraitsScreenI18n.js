import ruPerksAndTraitsScreen from '../../../../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../../../../i18n/en-EN/screens/perksAndTraits/screen.json';
import ruSettingPerks from '../../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enSettingPerks from '../../i18n/en-EN/screens/perksAndTraits/screen.json';
import { getCurrentLocale } from '../../../../i18n/locale';
import { deepMerge } from '../../../../i18n/mergeDicts';

const DICTIONARIES = {
  'ru-RU': deepMerge(ruPerksAndTraitsScreen, ruSettingPerks),
  'en-EN': deepMerge(enPerksAndTraitsScreen, enSettingPerks),
};

export const tPerksAndTraits = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = DICTIONARIES[getCurrentLocale()];
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
