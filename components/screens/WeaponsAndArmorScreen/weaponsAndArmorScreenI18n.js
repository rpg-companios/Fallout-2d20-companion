import ruWeaponsAndArmorScreen from '../../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWeaponsAndArmorScreen from '../../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
import { getCurrentLocale } from '../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': ruWeaponsAndArmorScreen,
  'en-EN': enWeaponsAndArmorScreen,
};

export const tWeaponsAndArmorScreen = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = DICTIONARIES[getCurrentLocale()];
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
