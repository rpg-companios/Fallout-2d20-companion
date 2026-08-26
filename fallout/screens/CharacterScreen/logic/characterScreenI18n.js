import ruCharacterScreen from "../../../../../i18n/ru-RU/screens/character/screen.json";
import enCharacterScreen from "../../../../../i18n/en-EN/screens/character/screen.json";
import ruSettingCharacterScreen from "../../../i18n/ru-RU/screens/character/screen.json";
import enSettingCharacterScreen from "../../../i18n/en-EN/screens/character/screen.json";
import { getCurrentLocale } from "../../../../../i18n/locale";
import { deepMerge } from "../../../../../i18n/mergeDicts";

export const CHARACTER_DICTIONARIES = {
  "ru-RU": deepMerge(ruCharacterScreen, ruSettingCharacterScreen),
  "en-EN": deepMerge(enCharacterScreen, enSettingCharacterScreen),
};

export const tCharacterScreen = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = CHARACTER_DICTIONARIES[getCurrentLocale()];
  for (const part of path.split(".")) {
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
  if (!skillKey) return "";
  const locale = getCurrentLocale();
  const dict = CHARACTER_DICTIONARIES[locale];
  return dict?.skillsCatalog?.[skillKey] || skillKey;
};
