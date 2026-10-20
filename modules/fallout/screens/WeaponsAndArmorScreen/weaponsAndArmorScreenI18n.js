import ruWeaponsAndArmorScreen from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWeaponsAndArmorScreen from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
import { getCurrentModuleLocale } from '../../../../i18n/locale';

export const WEAPONS_DICTIONARIES = {
  'ru-RU': ruWeaponsAndArmorScreen,
  'en-EN': enWeaponsAndArmorScreen,
};

export const tWeaponsAndArmorScreen = (path) => {
  // The Fallout package owns this screen's complete locale dictionary.
  let current = WEAPONS_DICTIONARIES[getCurrentModuleLocale()];
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
