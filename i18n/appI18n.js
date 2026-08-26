import ruApp from './ru-RU/App.json';
import enApp from './en-EN/App.json';
import ruSettingApp from '../modules/fallout/i18n/ru-RU/App.json';
import enSettingApp from '../modules/fallout/i18n/en-EN/App.json';
import { getCurrentLocale } from './locale';
import { deepMerge } from './mergeDicts';

const DICTIONARIES = {
  'ru-RU': deepMerge(ruApp, ruSettingApp),
  'en-EN': deepMerge(enApp, enSettingApp),
};

export const tApp = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = DICTIONARIES[getCurrentLocale()];
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
