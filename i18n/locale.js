import { useEffect, useState } from 'react';

const SUPPORTED_LOCALES = ['ru-RU', 'en-EN'];
const DEFAULT_LOCALE = 'ru-RU';

const normalizeLocale = (input) => {
  if (!input || typeof input !== 'string') return DEFAULT_LOCALE;
  const normalized = input.replace('_', '-');
  const exact = SUPPORTED_LOCALES.find(locale => locale.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;

  const langCode = normalized.slice(0, 2).toLowerCase();
  if (langCode === 'ru') return 'ru-RU';
  if (langCode === 'en') return 'en-EN';
  return DEFAULT_LOCALE;
};

const detectLocale = () => {
  try {
    const fromIntl = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
    return normalizeLocale(fromIntl);
  } catch (_) {
    return DEFAULT_LOCALE;
  }
};

let currentLocale = detectLocale();
const listeners = new Set();

const emitLocaleChange = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (_) {
      // no-op
    }
  });
};

export const subscribeToLocale = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCurrentLocale = () => currentLocale;
export const setCurrentLocale = (nextLocale) => {
  currentLocale = normalizeLocale(nextLocale);
  emitLocaleChange();
  return currentLocale;
};

export const useLocale = () => {
  const [locale, setLocale] = useState(getCurrentLocale());

  useEffect(() => {
    const unsubscribe = subscribeToLocale(() => {
      setLocale(getCurrentLocale());
    });
    return unsubscribe;
  }, []);

  return locale;
};

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, normalizeLocale };
