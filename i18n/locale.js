import { useEffect, useState } from 'react';
import { debugLog, FALLOUT_DEBUG_MARKER } from '../src/debug/falloutDebug';
import { getModuleLocales, resolveModuleLocale } from '../domain/moduleLocale';

const SUPPORTED_LOCALES = ['ru-RU', 'en-EN'];
const DEFAULT_LOCALE = 'ru-RU';

const normalizeLocale = (input) => {
  if (!input || typeof input !== 'string') return DEFAULT_LOCALE;
  const normalized = input.replace('_', '-');
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
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
let currentModuleLocale = resolveModuleLocale({ engineLocale: currentLocale });
const engineListeners = new Set();
const moduleListeners = new Set();

const emit = (listeners) => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (_) {
      // no-op
    }
  });
};

export const subscribeToLocale = (listener) => {
  engineListeners.add(listener);
  return () => engineListeners.delete(listener);
};

export const subscribeToModuleLocale = (listener) => {
  moduleListeners.add(listener);
  return () => moduleListeners.delete(listener);
};

/** Текущий язык интерфейса движка. */
export const getCurrentLocale = () => currentLocale;

export const setCurrentLocale = (nextLocale) => {
  const previousLocale = currentLocale;
  currentLocale = normalizeLocale(nextLocale);
  debugLog('locale.setCurrentLocale', {
    marker: FALLOUT_DEBUG_MARKER,
    previousLocale,
    nextLocale,
    normalizedLocale: currentLocale,
  });
  if (previousLocale !== currentLocale) emit(engineListeners);
  return currentLocale;
};

/** Текущий язык контента активного сеттинга. */
export const getCurrentModuleLocale = () => currentModuleLocale;

export const setCurrentModuleLocale = (nextLocale) => {
  if (typeof nextLocale !== 'string' || nextLocale.length === 0) {
    throw new Error('[locale] Язык сеттинга должен быть непустой строкой');
  }
  if (!getModuleLocales().includes(nextLocale)) {
    throw new Error(`[locale] Язык "${nextLocale}" не поддерживается активным сеттингом`);
  }
  const previousLocale = currentModuleLocale;
  currentModuleLocale = nextLocale;
  debugLog('locale.setCurrentModuleLocale', {
    marker: FALLOUT_DEBUG_MARKER,
    previousLocale,
    nextLocale,
  });
  if (previousLocale !== currentModuleLocale) emit(moduleListeners);
  return currentModuleLocale;
};

export const useLocale = () => {
  const [locale, setLocale] = useState(getCurrentLocale());

  useEffect(() => {
    const unsubscribe = subscribeToLocale(() => setLocale(getCurrentLocale()));
    return unsubscribe;
  }, []);

  return locale;
};

export const useModuleLocale = () => {
  const [locale, setLocale] = useState(getCurrentModuleLocale());

  useEffect(() => {
    const unsubscribe = subscribeToModuleLocale(() => setLocale(getCurrentModuleLocale()));
    return unsubscribe;
  }, []);

  return locale;
};

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, normalizeLocale };
