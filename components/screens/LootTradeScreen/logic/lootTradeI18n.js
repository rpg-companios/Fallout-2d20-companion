import ruLootTrade from '../../../../i18n/ru-RU/screens/lootTrade/screen.json';
import enLootTrade from '../../../../i18n/en-EN/screens/lootTrade/screen.json';
import { getCurrentLocale } from '../../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': ruLootTrade,
  'en-EN': enLootTrade,
};

export const tLootTrade = (path) => {
  let current = DICTIONARIES[getCurrentLocale()] || DICTIONARIES['ru-RU'];
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};

export const formatLootTrade = (template, params = {}) => (
  String(template).replace(/\{(\w+)\}/g, (_match, key) => (
    params[key] !== undefined && params[key] !== null ? String(params[key]) : `{${key}}`
  ))
);
