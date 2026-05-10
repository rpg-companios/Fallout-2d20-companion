import ruCharacterScreen from "../../../../i18n/ru-RU/screens/character/screen.json";
import enCharacterScreen from "../../../../i18n/en-EN/screens/character/screen.json";
import { getCurrentLocale } from "../../../../i18n/locale";

const DICTIONARIES = {
  "ru-RU": ruCharacterScreen,
  "en-EN": enCharacterScreen,
};

const RU_SKILLS = ruCharacterScreen?.skillsCatalog || {};
const RU_SKILL_TO_KEY = Object.entries(RU_SKILLS).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

export const tCharacterScreen = (path, fallback = "") => {
  const parts = path.split(".");
  const locale = getCurrentLocale();
  let current = DICTIONARIES[locale] || ruCharacterScreen;

  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return fallback || "Ошибка ключа";
  }

  return current;
};

export const getSkillDisplayName = (skillName) => {
  const locale = getCurrentLocale();
  if (locale === "ru-RU") return skillName;

  const dict = DICTIONARIES[locale] || ruCharacterScreen;
  const catalog = dict?.skillsCatalog || {};
  const skillKey = RU_SKILL_TO_KEY[skillName] || skillName;
  return catalog?.[skillKey] || skillName;
};
