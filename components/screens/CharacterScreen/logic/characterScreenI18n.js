import ruCharacterScreen from "../../../../i18n/ru-RU/screens/character/screen.json";
import enCharacterScreen from "../../../../i18n/en-EN/screens/character/screen.json";
import { getCurrentLocale } from "../../../../i18n/locale";

const DICTIONARIES = {
  "ru-RU": ruCharacterScreen,
  "en-EN": enCharacterScreen,
};

export const tCharacterScreen = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = DICTIONARIES[getCurrentLocale()];
  for (const part of path.split('.')) {
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
  const dict = DICTIONARIES[locale] || ruCharacterScreen;
  return dict?.skillsCatalog?.[skillKey] || skillKey;
};
