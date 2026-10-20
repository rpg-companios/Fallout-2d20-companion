import { getActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime';

/** The active package manifest is the only source of setting locale metadata. */
export const getActiveModuleId = () => getActiveSettingRuntime()?.manifest?.id ?? null;

/** A running app has at most one active setting package. */
export const getRegisteredModuleIds = () => {
  const id = getActiveModuleId();
  return id ? [id] : [];
};

const validateManifest = (manifest, moduleId) => {
  if (!manifest || manifest.id !== moduleId) {
    throw new Error(`[moduleLocale] Некорректный manifest модуля "${moduleId}"`);
  }
  if (!Array.isArray(manifest.locales) || manifest.locales.length === 0) {
    throw new Error(`[moduleLocale] ${moduleId}: locales должен содержать хотя бы один язык`);
  }
  if (new Set(manifest.locales).size !== manifest.locales.length) {
    throw new Error(`[moduleLocale] ${moduleId}: locales содержит дубликаты`);
  }
  if (!manifest.locales.every((locale) => typeof locale === 'string' && locale.length > 0)) {
    throw new Error(`[moduleLocale] ${moduleId}: каждый locale должен быть непустой строкой`);
  }
  if (!manifest.defaultLocale || !manifest.locales.includes(manifest.defaultLocale)) {
    throw new Error(`[moduleLocale] ${moduleId}: defaultLocale должен присутствовать в locales`);
  }
  return manifest;
};

export const getModuleManifest = (moduleId = getActiveModuleId()) => {
  const manifest = getActiveSettingRuntime()?.manifest;
  if (!moduleId || !manifest || manifest.id !== moduleId) {
    throw new Error(`[moduleLocale] Модуль "${moduleId ?? ''}" не активирован`);
  }
  return validateManifest(manifest, moduleId);
};

export const getModuleLocales = (moduleId = getActiveModuleId()) => {
  if (!moduleId) return [];
  return [...getModuleManifest(moduleId).locales];
};

/**
 * Resolve the setting's language. With no installed/active package, follow the
 * engine locale; no bundled setting is used as a hidden fallback.
 */
export const resolveLocaleFromManifest = ({
  manifest,
  moduleId = manifest?.id,
  engineLocale,
  manualLocale = null,
}) => {
  const validManifest = validateManifest(manifest, moduleId);
  if (validManifest.locales.length === 1) return validManifest.locales[0];
  if (manualLocale !== null && manualLocale !== undefined) {
    if (!validManifest.locales.includes(manualLocale)) {
      throw new Error(`[moduleLocale] ${moduleId}: ручной язык "${manualLocale}" отсутствует в locales`);
    }
    return manualLocale;
  }
  if (validManifest.locales.includes(engineLocale)) return engineLocale;
  return validManifest.defaultLocale;
};

export const resolveModuleLocale = ({
  moduleId = getActiveModuleId(),
  engineLocale,
  manualLocale = null,
} = {}) => {
  if (!moduleId) return engineLocale || 'ru-RU';
  return resolveLocaleFromManifest({
    manifest: getModuleManifest(moduleId),
    moduleId,
    engineLocale,
    manualLocale,
  });
};

/** The second selector is only needed if the engine locale is unsupported. */
export const shouldOfferLocaleChoiceForManifest = ({
  manifest,
  moduleId = manifest?.id,
  engineLocale,
}) => {
  const { locales } = validateManifest(manifest, moduleId);
  return locales.length > 1 && !locales.includes(engineLocale);
};

export const shouldOfferModuleLocaleChoice = ({
  moduleId = getActiveModuleId(),
  engineLocale,
} = {}) => {
  if (!moduleId) return false;
  return shouldOfferLocaleChoiceForManifest({
    manifest: getModuleManifest(moduleId),
    moduleId,
    engineLocale,
  });
};
