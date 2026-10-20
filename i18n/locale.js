import { useEffect, useState } from 'react';
import { debugLog, RUNTIME_DEBUG_MARKER } from '../src/engine/debug/runtimeTrace.js';
import { getModuleLocales, resolveModuleLocale } from '../domain/moduleLocale';
import { subscribeToActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime';

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
let moduleCatalogRevision = 0;
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
    marker: RUNTIME_DEBUG_MARKER,
    previousLocale,
    nextLocale,
    normalizedLocale: currentLocale,
  });
  if (previousLocale !== currentLocale) emit(engineListeners);
  if (getModuleLocales().length === 0 && currentModuleLocale !== currentLocale) {
    currentModuleLocale = currentLocale;
    notifyModuleCatalogChanged();
  }
  return currentLocale;
};

/** Текущий язык контента активного сеттинга. */
export const getCurrentModuleLocale = () => currentModuleLocale;
export const getModuleCatalogRevision = () => moduleCatalogRevision;

/** Notify subscribers that localized setting data (not just its language) changed. */
export const notifyModuleCatalogChanged = () => {
  moduleCatalogRevision += 1;
  emit(moduleListeners);
};

subscribeToActiveSettingRuntime(() => {
  const nextLocale = resolveModuleLocale({ engineLocale: currentLocale });
  if (nextLocale !== currentModuleLocale) {
    currentModuleLocale = nextLocale;
    notifyModuleCatalogChanged();
  }
});

export const setCurrentModuleLocale = (nextLocale) => {
  if (typeof nextLocale !== 'string' || nextLocale.length === 0) {
    throw new Error('[locale] Язык сеттинга должен быть непустой строкой');
  }
  const supportedModuleLocales = getModuleLocales();
  if (supportedModuleLocales.length > 0 && !supportedModuleLocales.includes(nextLocale)) {
    throw new Error(`[locale] Язык "${nextLocale}" не поддерживается активным сеттингом`);
  }
  if (supportedModuleLocales.length === 0 && nextLocale !== currentLocale) {
    throw new Error('[locale] Без активного сеттинга язык контента следует языку движка');
  }
  const previousLocale = currentModuleLocale;
  currentModuleLocale = nextLocale;
  debugLog('locale.setCurrentModuleLocale', {
    marker: RUNTIME_DEBUG_MARKER,
    previousLocale,
    nextLocale,
  });
  if (previousLocale !== currentModuleLocale) notifyModuleCatalogChanged();
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
  const [snapshot, setSnapshot] = useState(() => ({
    locale: getCurrentModuleLocale(),
    revision: getModuleCatalogRevision(),
  }));

  useEffect(() => {
    const unsubscribe = subscribeToModuleLocale(() => setSnapshot({
      locale: getCurrentModuleLocale(),
      revision: getModuleCatalogRevision(),
    }));
    return unsubscribe;
  }, []);

  return snapshot.locale;
};

export const useModuleCatalogRevision = () => {
  const [revision, setRevision] = useState(getModuleCatalogRevision());
  useEffect(() => subscribeToModuleLocale(() => setRevision(getModuleCatalogRevision())), []);
  return revision;
};

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, normalizeLocale };
