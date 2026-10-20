import { getSettingData, getSettingNames } from '../../../domain/registry.js';
import { getActiveSettingRuntime } from '../../../src/engine/settings/activeSettingRuntime.js';
import { getCurrentModuleLocale } from '../../../i18n/locale.js';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

export const getScrapJunkItems = () => getSettingData('junk', 'items') ?? EMPTY_ARRAY;
export const getScrapMaterials = () => getSettingData('junk', 'materials') ?? EMPTY_ARRAY;
export const getScrapTables = () => getSettingData('junk', 'tables') ?? EMPTY_OBJECT;

export const getScrapTableLabels = (locale = getCurrentModuleLocale()) => {
  const runtime = getActiveSettingRuntime();
  if (!runtime) return EMPTY_OBJECT;
  const supportedLocales = runtime.manifest?.locales ?? Object.keys(runtime.setting?.names ?? {});
  if (!supportedLocales.includes(locale)) {
    throw new Error(`[fallout:salvage] Setting "${runtime.id}" has no junk-table labels for "${locale}"`);
  }
  const fallbackLocale = runtime.manifest?.defaultLocale;
  return getSettingNames(locale)?.junk?.tableLabels
    ?? getSettingNames(fallbackLocale)?.junk?.tableLabels
    ?? EMPTY_OBJECT;
};

const collectSalvageCompositions = (node, byId) => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectSalvageCompositions(child, byId));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (typeof node.id === 'string' && Array.isArray(node.composition)) {
    if (byId.has(node.id)) {
      throw new Error(`[fallout:salvage] Duplicate salvage composition for ${node.id}`);
    }
    byId.set(node.id, { options: node.composition });
  }
  Object.values(node).forEach((child) => collectSalvageCompositions(child, byId));
};

export const getSalvageComposition = (itemId) => {
  const byId = new Map();
  collectSalvageCompositions(getScrapJunkItems(), byId);
  collectSalvageCompositions(getSettingData('equipment', 'generalGoods') ?? EMPTY_ARRAY, byId);
  return byId.get(itemId) ?? null;
};
