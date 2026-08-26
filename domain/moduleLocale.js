import falloutManifest from '../modules/fallout/manifest.json';

const MODULE_MANIFESTS = Object.freeze({
  fallout: falloutManifest,
});

const ACTIVE_MODULE_ID = falloutManifest.id;

/** Идентификатор сеттинга, подключённого реестром данных. */
export const getActiveModuleId = () => ACTIVE_MODULE_ID;

/** Идентификаторы всех зарегистрированных сеттингов. */
export const getRegisteredModuleIds = () => Object.keys(MODULE_MANIFESTS);

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

export const getModuleManifest = (moduleId = ACTIVE_MODULE_ID) => {
  const manifest = MODULE_MANIFESTS[moduleId];
  if (!manifest) {
    throw new Error(`[moduleLocale] Модуль "${moduleId}" не зарегистрирован`);
  }
  return validateManifest(manifest, moduleId);
};

export const getModuleLocales = (moduleId = ACTIVE_MODULE_ID) =>
  [...getModuleManifest(moduleId).locales];

/**
 * Язык сеттинга:
 * 1. единственный язык сеттинга;
 * 2. ручной выбор пользователя для этого сеттинга (если он был сделан);
 * 3. язык движка при точном совпадении;
 * 4. обязательный defaultLocale из manifest.
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
  moduleId = ACTIVE_MODULE_ID,
  engineLocale,
  manualLocale = null,
}) => resolveLocaleFromManifest({
  manifest: getModuleManifest(moduleId),
  moduleId,
  engineLocale,
  manualLocale,
});

/** Второй переключатель нужен только при нескольких языках без совпадения с движком. */
export const shouldOfferLocaleChoiceForManifest = ({
  manifest,
  moduleId = manifest?.id,
  engineLocale,
}) => {
  const { locales } = validateManifest(manifest, moduleId);
  return locales.length > 1 && !locales.includes(engineLocale);
};

export const shouldOfferModuleLocaleChoice = ({ moduleId = ACTIVE_MODULE_ID, engineLocale }) =>
  shouldOfferLocaleChoiceForManifest({
    manifest: getModuleManifest(moduleId),
    moduleId,
    engineLocale,
  });
