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

import originsJson from '../data/origins/origins.json';
import traitsJson from '../data/traits/traits.json';
import bodyplansJson from '../data/bodyplans/bodyplans.json';
import ruOriginsDict from '../i18n/ru-RU/data/system/origins.json';
import enOriginsDict from '../i18n/en-EN/data/system/origins.json';
import ruTraitsDict from '../i18n/ru-RU/data/system/traits.json';
import enTraitsDict from '../i18n/en-EN/data/system/traits.json';

// ── Модуль сеттинга (modules/fallout) ──────────────────────────────────────
import moduleOrigins from '../modules/fallout/data/origins.json';
import moduleTraits from '../modules/fallout/data/traits.json';
import moduleWeapons from '../modules/fallout/data/weapons.json';
import moduleGeneralGoods from '../modules/fallout/data/general_goods.json';
import moduleEquipmentKits from '../modules/fallout/data/equipmentKits/index.js';
import moduleRuI18n from '../modules/fallout/i18n/ru-RU.json';
import moduleEnI18n from '../modules/fallout/i18n/en-EN.json';

import baseWeapons from '../data/equipment/weapons.json';
import baseUniqQualities from '../data/equipment/uniq_qualities.json';

import moduleUniqQualities from '../modules/fallout/data/uniq_qualities.json';

import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getCurrentLocale } from '../i18n/locale';
import { deepMerge, expandTrueItems } from './packMerge';

/**
 * Слияние массивов записей по id: записи override (модуль) перекрывают base
 * с тем же id; новые id — добавляются. Порядок base сохраняется, новые — в конец.
 */
export function mergeArraysById(base = [], override = []) {
  const byId = new Map();
  base.forEach((entry) => { if (entry?.id) byId.set(entry.id, entry); });
  (override || []).forEach((entry) => { if (entry?.id) byId.set(entry.id, entry); });
  const seen = new Set();
  const out = [];
  for (const entry of [...base, ...(override || [])]) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(byId.get(entry.id));
  }
  return out;
}

/**
 * Все ориджины: база + модуль (модуль перекрывает по id).
 */
export function getOrigins() {
  return mergeArraysById(originsJson, moduleOrigins);
}

/**
 * Все трейты: база + модуль.
 */
export function getTraits() {
  return mergeArraysById(traitsJson, moduleTraits);
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
  const base = locale === 'en-EN' ? enOriginsDict : ruOriginsDict;
  const moduleDict = locale === 'en-EN' ? moduleEnI18n.origins : moduleRuI18n.origins;
  return { ...base, ...(moduleDict || {}) };
}

/**
 * Словарь трейтов для локали (база + модуль, deep merge).
 * Формат: { traits: { [originKey]: { [traitKey]: { name, description } } } }
 */
export function getTraitI18n(locale) {
  const base = locale === 'en-EN' ? enTraitsDict : ruTraitsDict;
  const moduleDict = locale === 'en-EN' ? moduleEnI18n.traits : moduleRuI18n.traits;
  return moduleDict ? deepMerge(base, { traits: moduleDict }) : base;
}

/**
 * Дополнительное оружие модуля (новые id; каталог подмешивает поверх базы).
 * Варианты (trueItemId) разворачиваются в полные записи — механика из
 * истинного предмета data/, id/модификаторы — из варианта.
 */
export function getModuleWeapons() {
  return expandTrueItems(moduleWeapons, baseWeapons);
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
 * Полный i18n-словарь модуля для локали (origins/traits/weapons/generalGoods/equipmentKits/uniqQualities).
 */
export function getModuleI18n(locale) {
  return locale === 'en-EN' ? moduleEnI18n : moduleRuI18n;
}

/**
 * Уникальные качества (uniq qualities): навешиваемые на экипировку
 * модификаторы (имя + эффекты). База + модуль (модуль перекрывает по id).
 * Сейчас каталог пустой — определения добавляет владелец в модуль.
 */
export function getUniqQualities() {
  return mergeArraysById(baseUniqQualities, moduleUniqQualities);
}

/**
 * Имя уникального качества из i18n модуля по id (для локали).
 * Пустая строка — имя не задано (качество есть, но имени нет).
 */
export function getUniqQualityName(id, locale = getCurrentLocale()) {
  if (!id) return '';
  const i18n = locale === 'en-EN' ? moduleEnI18n : moduleRuI18n;
  const entry = (i18n.uniqQualities || []).find((q) => q?.id === id);
  return entry?.name || '';
}

/**
 * Каталог снаряжения (оружие/броня/комплекты/i18n).
 */
export function getEquipmentCatalogForLocale(locale) {
  return getEquipmentCatalog(locale);
}
