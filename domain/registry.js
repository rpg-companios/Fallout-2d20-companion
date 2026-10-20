// The engine's setting data registry. It only reads the currently activated
// package; no setting is bundled or selected as a fallback.
import { getActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../i18n/locale';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

const getActiveSetting = () => getActiveSettingRuntime()?.setting ?? null;

/** Return an explicitly exported service from the activated setting runtime. */
export const getSettingService = (serviceId) => {
  return getActiveSettingRuntime()?.services?.[serviceId] ?? null;
};

const getData = (...path) => path.reduce((value, key) => value?.[key], getActiveSetting()?.data);
/** Read arbitrary data declared by the active setting without naming its domain. */
export const getSettingData = (...path) => getData(...path);
const getNames = (locale = getCurrentModuleLocale()) => getActiveSetting()?.names?.[locale] ?? null;

export function getSettingScreenI18n(screenId, locale = getCurrentModuleLocale()) {
  const activeLocale = requireModuleLocale(locale);
  return activeLocale ? getNames(activeLocale)?.screens?.[screenId] ?? EMPTY_OBJECT : EMPTY_OBJECT;
}

const requireModuleLocale = (locale) => {
  const runtime = getActiveSettingRuntime();
  if (!runtime) return null;
  const supportedLocales = runtime.manifest?.locales ?? Object.keys(runtime.setting?.names ?? {});
  if (!supportedLocales.includes(locale)) {
    throw new Error(`[registry] Для языка сеттинга "${locale}" нет каталога данных`);
  }
  return locale;
};

/** The active setting's origins, or an empty catalogue before activation. */
export function getOrigins() {
  return getData('origins') ?? EMPTY_ARRAY;
}

/** Fit-profile data declared by the active setting. */
export function getFitProfileData() {
  return getData('fitProfiles') ?? EMPTY_OBJECT;
}

/** Item categories declared by the active setting. */
export function getCategories() {
  return getData('equipment', 'categories') ?? EMPTY_ARRAY;
}

export function getTraits() {
  return getData('traits') ?? EMPTY_ARRAY;
}

export function getPerks() {
  return getData('perks') ?? EMPTY_ARRAY;
}

export function getPerksI18n(locale = getCurrentModuleLocale()) {
  const activeLocale = requireModuleLocale(locale);
  return activeLocale ? getNames(activeLocale)?.perks ?? EMPTY_ARRAY : EMPTY_ARRAY;
}

export function getOriginI18n(locale) {
  const activeLocale = requireModuleLocale(locale);
  return activeLocale ? getNames(activeLocale)?.system?.origins ?? EMPTY_OBJECT : EMPTY_OBJECT;
}

export function getTraitI18n(locale) {
  const activeLocale = requireModuleLocale(locale);
  return activeLocale ? getNames(activeLocale)?.system?.traits ?? EMPTY_OBJECT : EMPTY_OBJECT;
}

/** The active setting's weapons, with variants expanded from setting-owned data. */
export function getModuleWeapons() {
  const weapons = getData('equipment', 'weapons') ?? EMPTY_ARRAY;
  const expandCatalogItems = getSettingService('inventory')?.expandCatalogItems;
  return typeof expandCatalogItems === 'function'
    ? expandCatalogItems(weapons, weapons)
    : weapons;
}

export function getModuleGeneralGoods() {
  return getData('equipment', 'generalGoods') ?? EMPTY_ARRAY;
}

export function getModuleEquipmentKits() {
  return getData('equipmentKits') ?? EMPTY_OBJECT;
}

/** Mechanics supplied by the active setting's runtime, never by the engine. */
export function getDerivedStatsLogic() {
  return getActiveSetting()?.logic?.derivedStats ?? null;
}

/** Character-creation rules supplied by the active setting; never defaulted. */
export function getCharacterCreationLogic() {
  return getActiveSetting()?.logic?.characterCreation ?? null;
}

export function getSurvivalRules() {
  return getActiveSetting()?.logic?.survivalRules ?? null;
}

const getCraftingContext = () => {
  const data = getData('recipes');
  const manifest = data?.manifest ?? { recipes: [] };
  const sections = data?.sections ?? EMPTY_OBJECT;
  const rules = data?.categoryRules ?? EMPTY_OBJECT;
  const byId = new Map();
  const list = [];

  for (const entry of manifest.recipes ?? []) {
    const sectionKey = entry.file.replace(/\.json$/i, '');
    const rows = sections[entry.file] ?? sections[sectionKey] ?? [];
    for (const recipe of rows) {
      if (byId.has(recipe.id)) {
        throw new Error(`[registry] Duplicate crafting recipe id: ${recipe.id}`);
      }
      const augmented = Object.freeze({ ...recipe, category: entry.category });
      byId.set(recipe.id, augmented);
      list.push(augmented);
    }
    if (rows.length !== entry.count) {
      throw new Error(`[registry] Crafting index does not match ${entry.file}: ${entry.count} vs ${rows.length}`);
    }
  }

  return { manifest, rules, byId, list: Object.freeze(list) };
};

export function getCraftingRecipes() {
  return getCraftingContext().list;
}

export function getCraftingRecipeById(recipeId) {
  return getCraftingContext().byId.get(recipeId) ?? null;
}

export function getCraftingCategories() {
  return (getCraftingContext().manifest.recipes ?? []).map((entry) => entry.category);
}

export function getCraftingCategoryRules(category) {
  const { manifest, rules } = getCraftingContext();
  const entry = (manifest.recipes ?? []).find((item) => item.category === category);
  if (!entry) return null;
  return Object.freeze({ ...(rules[entry.category] ?? {}) });
}

export function getCraftingCategoryRuleRegistry() {
  return Object.freeze(Object.fromEntries(getCraftingCategories().map((category) => [
    category,
    getCraftingCategoryRules(category),
  ])));
}

/** Return the active setting's translated dictionaries as an opaque tree. */
export function getSettingNames(locale = getCurrentModuleLocale()) {
  const activeLocale = requireModuleLocale(locale);
  return activeLocale ? getNames(activeLocale) ?? EMPTY_OBJECT : EMPTY_OBJECT;
}

export function getUserEquipmentStorageContract() {
  return getActiveSetting()?.userData?.equipment ?? null;
}

export function getEquipmentCatalogForLocale(locale) {
  return getEquipmentCatalog(locale);
}
