// domain/registry.js
// Реестр данных движка — ЕДИНАЯ точка чтения данных сеттинга.
//
// Источники:
//   base   — встроенные данные data/ (движок поставляется без сеттинга,
//            но для обратной совместимости пока читает data/);
//   module — модуль сеттинга modules/fallout/ (новый контент пишется сюда).
//
// Приоритет: module > base (по id для массивов, deep merge для словарей i18n).
// Все потребители (domain/*, компоненты) читают данные ТОЛЬКО через реестр.

// ── Модуль сеттинга (modules/fallout) ──────────────────────────────────────
import bodyplansJson from '../modules/fallout/data/bodyplans/bodyplans.json';

import moduleOrigins from '../modules/fallout/data/origins/origins.json';
import moduleFitProfiles from '../modules/fallout/data/origins/fitProfiles.json';
import moduleCategories from '../modules/fallout/data/equipment/categories.json';
import moduleTraits from '../modules/fallout/data/traits/traits.json';
import modulePerks from '../modules/fallout/data/perks/perks.json';
import moduleWeapons from '../modules/fallout/data/equipment/weapons.json';
import moduleGeneralGoods from '../modules/fallout/data/equipment/general_goods.json';
import moduleDiseaseExposureRule from '../modules/fallout/data/rules/diseaseExposure.json';
import moduleEquipmentKits from '../modules/fallout/data/equipmentKits/index.js';

// i18n модуля сеттинга — по категориям, зеркало раскладки i18n/<locale>/data/.
import moduleRuOriginsI18n from '../modules/fallout/i18n/ru-RU/data/system/origins.json';
import moduleEnOriginsI18n from '../modules/fallout/i18n/en-EN/data/system/origins.json';
import moduleRuTraitsI18n from '../modules/fallout/i18n/ru-RU/data/system/traits.json';
import moduleEnTraitsI18n from '../modules/fallout/i18n/en-EN/data/system/traits.json';
import moduleRuEquipmentKitsI18n from '../modules/fallout/i18n/ru-RU/data/system/equipmentKits.json';
import moduleEnEquipmentKitsI18n from '../modules/fallout/i18n/en-EN/data/system/equipmentKits.json';
import moduleRuUniqQualitiesI18n from '../modules/fallout/i18n/ru-RU/data/system/uniq_qualities.json';
import moduleEnUniqQualitiesI18n from '../modules/fallout/i18n/en-EN/data/system/uniq_qualities.json';
import moduleRuWeaponsI18n from '../modules/fallout/i18n/ru-RU/data/equipment/weapons/weapons.json';
import moduleEnWeaponsI18n from '../modules/fallout/i18n/en-EN/data/equipment/weapons/weapons.json';
import moduleRuClothesI18n from '../modules/fallout/i18n/ru-RU/data/equipment/armor/clothes.json';
import moduleEnClothesI18n from '../modules/fallout/i18n/en-EN/data/equipment/armor/clothes.json';
import moduleRuGeneralGoodsI18n from '../modules/fallout/i18n/ru-RU/data/equipment/general_goods.json';
import moduleEnGeneralGoodsI18n from '../modules/fallout/i18n/en-EN/data/equipment/general_goods.json';
import moduleRuWeaponModsI18n from '../modules/fallout/i18n/ru-RU/data/equipment/weapon_mods.json';
import moduleEnWeaponModsI18n from '../modules/fallout/i18n/en-EN/data/equipment/weapon_mods.json';
import moduleRuFoodI18n from '../modules/fallout/i18n/ru-RU/data/consumables/food.json';
import moduleEnFoodI18n from '../modules/fallout/i18n/en-EN/data/consumables/food.json';
import moduleRuDrinksI18n from '../modules/fallout/i18n/ru-RU/data/consumables/drinks.json';
import moduleEnDrinksI18n from '../modules/fallout/i18n/en-EN/data/consumables/drinks.json';
import moduleRuSettingsI18n from '../modules/fallout/i18n/ru-RU/data/system/settings.json';
import moduleEnSettingsI18n from '../modules/fallout/i18n/en-EN/data/system/settings.json';


import moduleUniqQualities from '../modules/fallout/data/equipment/uniq_qualities.json';

import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getDiseasesCatalog } from '../i18n/conditionsCatalog';
import { getCurrentModuleLocale } from '../i18n/locale';
import { expandTrueItems } from './packMerge';

const requireModuleLocale = (locale) => {
  if (locale !== 'ru-RU' && locale !== 'en-EN') {
    throw new Error(`[registry] Для языка сеттинга "${locale}" нет каталога данных`);
  }
  return locale;
};

/**
 * Все ориджины: база + модуль (модуль перекрывает по id).
 */
export function getOrigins() {
  return moduleOrigins;
}

/**
 * Профили fitProfile по characterType (данные сеттинга). Заменяет
 * цепочку origins.armorPolicy → canEquip → allowlist.
 */
export function getFitProfileData() {
  return moduleFitProfiles;
}

/**
 * Справочник категорий предметов (данные сеттинга). Категории используются
 * матчерами fitProfile и соответствуют наборам данных (поля/id данных).
 */
export function getCategories() {
  return moduleCategories;
}

/**
 * Все трейты: база + модуль.
 */
export function getTraits() {
  return moduleTraits;
}

/**
 * Перки активного сеттинга. Каталог живёт в модуле; движок читает его
 * только через реестр.
 */
export function getPerks() {
  return modulePerks;
}

/**
 * Планы тела (движковые данные; сеттинг может добавить свои).
 */
export function getBodyPlans() {
  return bodyplansJson;
}

/**
 * Словарь имён ориджинов для локали (база + модуль).
 * Формат: { [originId]: string }
 */
export function getOriginI18n(locale) {
  return requireModuleLocale(locale) === 'en-EN' ? moduleEnOriginsI18n : moduleRuOriginsI18n;
}

/**
 * Словарь трейтов для локали (база + модуль, deep merge).
 * Формат: { traits: { [originKey]: { [traitKey]: { name, description } } } }
 */
export function getTraitI18n(locale) {
  return requireModuleLocale(locale) === 'en-EN' ? moduleEnTraitsI18n : moduleRuTraitsI18n;
}

/**
 * Оружие модуля (самодостаточно, патч 102): полный список сеттинга,
 * варианты (trueItemId) разворачиваются внутри самого модуля — чтения
 * движковой базы data/ нет.
 */
export function getModuleWeapons() {
  return expandTrueItems(moduleWeapons, moduleWeapons);
}

/**
 * Дополнительные предметы модуля (general goods / misc).
 */
export function getModuleGeneralGoods() {
  return moduleGeneralGoods;
}

/**
 * Комплекты модуля: { [kitId]: { items } }.
 */
export function getModuleEquipmentKits() {
  return moduleEquipmentKits;
}

/**
 * Полный i18n-словарь модуля для локали. Собирается из файлов по категориям
 * (modules/fallout/i18n/<locale>/data/...): origins, traits, equipmentKits,
 * uniqQualities, weapons, clothes, generalGoods, weaponMods, food, drinks.
 */
export function getModuleI18n(locale) {
  const isEn = requireModuleLocale(locale) === 'en-EN';
  return {
    origins: isEn ? moduleEnOriginsI18n : moduleRuOriginsI18n,
    traits: isEn ? moduleEnTraitsI18n : moduleRuTraitsI18n,
    equipmentKits: isEn ? moduleEnEquipmentKitsI18n : moduleRuEquipmentKitsI18n,
    uniqQualities: isEn ? moduleEnUniqQualitiesI18n : moduleRuUniqQualitiesI18n,
    weapons: isEn ? moduleEnWeaponsI18n : moduleRuWeaponsI18n,
    clothes: isEn ? moduleEnClothesI18n : moduleRuClothesI18n,
    generalGoods: isEn ? moduleEnGeneralGoodsI18n : moduleRuGeneralGoodsI18n,
    weaponMods: isEn ? moduleEnWeaponModsI18n : moduleRuWeaponModsI18n,
    food: isEn ? moduleEnFoodI18n : moduleRuFoodI18n,
    drinks: isEn ? moduleEnDrinksI18n : moduleRuDrinksI18n,
    settings: isEn ? moduleEnSettingsI18n : moduleRuSettingsI18n,
  };
}

/**
 * Уникальные качества (uniq qualities): навешиваемые на экипировку
 * модификаторы (имя + эффекты). База + модуль (модуль перекрывает по id).
 * Сейчас каталог пустой — определения добавляет владелец в модуль.
 */
export function getUniqQualities() {
  return moduleUniqQualities;
}

/**
 * Имя уникального качества из i18n модуля по id (для локали).
 * Пустая строка — имя не задано (качество есть, но имени нет).
 */
export function getUniqQualityName(id, locale = getCurrentModuleLocale()) {
  if (!id) return '';
  const i18n = requireModuleLocale(locale) === 'en-EN'
    ? moduleEnUniqQualitiesI18n
    : moduleRuUniqQualitiesI18n;
  const entry = (i18n || []).find((q) => q?.id === id);
  return entry?.name || '';
}

/**
 * Каталог снаряжения (оружие/броня/комплекты/i18n).
 */
export function getEquipmentCatalogForLocale(locale) {
  return getEquipmentCatalog(locale);
}

/**
 * Canonical real-time scene risk rules declared by the active setting.
 * Consumables opt into these rules through explicit sceneRiskEvents metadata.
 */
export function getSceneRiskRules() {
  return [moduleDiseaseExposureRule];
}

/** Localized condition catalog supplied by the active setting. */
export function getConditionCatalog(conditionType, locale = getCurrentModuleLocale()) {
  if (conditionType === 'disease') return getDiseasesCatalog(locale);
  throw new Error(`[registry] Неизвестный тип состояния "${conditionType}"`);
}
