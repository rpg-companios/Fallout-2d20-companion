import ruHomeScreen from "../../../../i18n/ru-RU/screens/home/screen.json";
import enHomeScreen from "../../../../i18n/en-EN/screens/home/screen.json";
import { getCurrentLocale } from "../../../../i18n/locale";

const DICTIONARIES = {
  "ru-RU": ruHomeScreen,
  "en-EN": enHomeScreen,
};

export const tHomeScreen = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = DICTIONARIES[getCurrentLocale()];
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
