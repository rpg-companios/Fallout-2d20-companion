import ruApp from './ru-RU/App.json';
import enApp from './en-EN/App.json';
import { getCurrentLocale } from './locale';

const DICTIONARIES = {
  'ru-RU': ruApp,
  'en-EN': enApp,
};

export const tApp = (path, fallback = '') => {
  const parts = path.split('.');
  const locale = getCurrentLocale();
  let current = DICTIONARIES[locale] || ruApp;

  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return fallback || 'Ошибка ключа';
  }

  return current;
};
