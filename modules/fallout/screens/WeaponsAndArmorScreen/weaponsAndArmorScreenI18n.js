import ruWeaponsAndArmorScreen from '../../../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWeaponsAndArmorScreen from '../../../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
import ruSettingWaA from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enSettingWaA from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
import { getCurrentLocale } from '../../../../i18n/locale';
import { deepMerge } from '../../../../i18n/mergeDicts';

export const WEAPONS_DICTIONARIES = {
  'ru-RU': deepMerge(ruWeaponsAndArmorScreen, ruSettingWaA),
  'en-EN': deepMerge(enWeaponsAndArmorScreen, enSettingWaA),
};

export const tWeaponsAndArmorScreen = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = WEAPONS_DICTIONARIES[getCurrentLocale()];
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
