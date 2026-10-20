import ruCharacterScreen from '../../../i18n/ru-RU/screens/character/screen.json';
import enCharacterScreen from '../../../i18n/en-EN/screens/character/screen.json';
import { getCurrentModuleLocale } from '../../../../../i18n/locale';

export const CHARACTER_DICTIONARIES = {
  'ru-RU': ruCharacterScreen,
  'en-EN': enCharacterScreen,
};

export const tCharacterScreen = (path) => {
  // The Fallout package owns this screen's complete locale dictionary.
  let current = CHARACTER_DICTIONARIES[getCurrentModuleLocale()];
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};

/**
 * Returns the localized display name for a canonical SKILL key
 * (UPPER_SNAKE_CASE, e.g. 'SMALL_GUNS' → 'Стрелковое оружие').
 * The input is always a canonical key — no alias bridge, no fallback to
 * localized names. If unknown, returns the key itself (visible regression
 * signal during dev).
 */
export const getSkillDisplayName = (skillKey) => {
  if (!skillKey) return '';
  const dict = CHARACTER_DICTIONARIES[getCurrentModuleLocale()];
  return dict?.skillsCatalog?.[skillKey] || skillKey;
};
