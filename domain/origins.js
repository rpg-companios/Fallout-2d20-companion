// Generic origin access for the active setting. Setting-owned fields and
// presentation enrichment are interpreted by an optional runtime capability.
import { getOrigins, getOriginI18n, getSettingService } from './registry.js';
import { getCurrentModuleLocale } from '../i18n/locale.js';

/** Return the localized display name for an origin using the active setting's dictionary. */
export function tOrigin(id) {
  if (!id) return '';
  const locale = getCurrentModuleLocale();
  const dictionary = getOriginI18n(locale);
  if (!dictionary) {
    throw new Error(`[origins] Для языка сеттинга "${locale}" нет словаря ориджинов`);
  }
  const translated = dictionary[id];
  if (typeof translated !== 'string' || translated.length === 0) {
    throw new Error(`[origins] Для ориджина "${id}" нет перевода`);
  }
  return translated;
}

/** Return the active setting's raw origin records without interpreting their fields. */
export function loadOriginsData() {
  return getOrigins();
}

/**
 * Ask the active setting to enrich its own origin records. The fallback keeps
 * only opaque setting data plus the common id/name/image presentation fields.
 */
export function loadEnrichedOrigins() {
  const presentation = getSettingService('originPresentation');
  if (typeof presentation?.getEnrichedOrigins === 'function') {
    return presentation.getEnrichedOrigins();
  }
  return getOrigins().map((origin) => ({
    ...origin,
    name: tOrigin(origin.id),
    image: presentation?.getImage?.(origin.id) ?? null,
  }));
}

/** Return the active setting's enriched origin record by id, or null. */
export function findEnrichedOrigin(originId) {
  if (!originId) return null;
  return loadEnrichedOrigins().find((origin) => origin.id === originId) ?? null;
}
