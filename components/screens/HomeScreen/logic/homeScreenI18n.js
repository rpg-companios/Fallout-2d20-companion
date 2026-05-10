import ruHomeScreen from "../../../../i18n/ru-RU/screens/home/screen.json";
import enHomeScreen from "../../../../i18n/en-EN/screens/home/screen.json";
import { getCurrentLocale } from "../../../../i18n/locale";

const DICTIONARIES = {
  "ru-RU": ruHomeScreen,
  "en-EN": enHomeScreen,
};

export const tHomeScreen = (path, fallback = "") => {
  const parts = path.split(".");
  const locale = getCurrentLocale();
  let current = DICTIONARIES[locale] || ruHomeScreen;

  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return fallback || "Ошибка ключа";
  }

  return current;
};
