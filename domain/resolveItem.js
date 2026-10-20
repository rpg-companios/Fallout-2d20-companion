// Generic item catalog lookup and enrichment adapter.
// Catalog structure, item-type interpretation, instance payloads, and derived
// modifier rules are supplied by the active setting's inventory capability.

import { getSettingService } from './registry.js';

const getInventoryService = () => getSettingService('inventory');

/** Interpret a legacy item type through the active setting, or use a neutral type. */
export const inferItemType = (item) => {
  if (!item) return 'misc';
  if (typeof item.itemType === 'string' && item.itemType) return item.itemType;
  const infer = getInventoryService()?.inferItemTypeFromItem;
  const settingItemType = typeof infer === 'function' ? infer(item) : null;
  return typeof settingItemType === 'string' && settingItemType ? settingItemType : 'misc';
};

/** Lookup is wholly setting-owned: the engine does not know catalog categories. */
export const findCatalogEntry = (catalog, id, itemType) => {
  if (!id || !catalog) return null;
  const find = getInventoryService()?.findCatalogEntry;
  return typeof find === 'function' ? (find(catalog, id, itemType) || null) : null;
};

const CORE_INSTANCE_FIELDS = Object.freeze([
  'id',
  'catalogId',
  'itemType',
  'quantity',
  'equipped',
  'locked',
  'stackKey',
  'equipInstanceId',
  'uniqueId',
]);

const getInstanceFields = () => {
  const settingFields = getInventoryService()?.itemInstanceFields;
  return [
    ...new Set([
      ...CORE_INSTANCE_FIELDS,
      ...(Array.isArray(settingFields) ? settingFields.filter((field) => typeof field === 'string') : []),
    ]),
  ];
};

/**
 * Compatibility adapter for screens that request the active setting's
 * weapon-specific enrichment explicitly. The engine does not interpret it.
 */
export const resolveWeaponWithAppliedMods = (weapon, catalog) => {
  const enrich = getInventoryService()?.features?.itemModifiers?.enrichWeapon;
  return typeof enrich === 'function' ? (enrich(weapon, catalog) ?? weapon) : weapon;
};

/** Apply any setting-owned derived item behavior, if the active setting provides it. */
export const resolveEffectiveItem = (item, catalog) => {
  const resolve = getInventoryService()?.resolveModifiedItem;
  if (typeof resolve !== 'function') return item;
  const resolved = resolve(item, catalog);
  return resolved === null || resolved === undefined ? item : resolved;
};

/**
 * Enrich one stored item instance with its catalog record. The setting owns the
 * mapping from its instance key to catalog ID and the instance-only payload
 * fields that must survive this projection.
 */
export const resolveItem = (instance, catalog) => {
  if (!instance || !instance.id) return instance;
  const inventoryService = getInventoryService();
  const itemType = instance.itemType || inferItemType(instance);
  const getCatalogItemId = inventoryService?.getCatalogItemId;
  const catalogId = (typeof getCatalogItemId === 'function' ? getCatalogItemId(instance) : null)
    || instance.catalogId
    || instance.id;
  const base = findCatalogEntry(catalog, catalogId, itemType);
  if (!base) return instance;

  const instanceState = {};
  getInstanceFields().forEach((field) => {
    if (instance[field] !== undefined) instanceState[field] = instance[field];
  });
  return resolveEffectiveItem({ ...base, ...instanceState, name: base.name }, catalog);
};

/** Generic catalog price projection, with support for common legacy aliases. */
export const getItemPrice = (item) =>
  parseFloat(item?.cost ?? item?.price ?? item?.value) || 0;

/** Generic catalog weight projection. */
export const getItemWeight = (item) =>
  parseFloat(String(item?.weight ?? 0).replace(',', '.')) || 0;
