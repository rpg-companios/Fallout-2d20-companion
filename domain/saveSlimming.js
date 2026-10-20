// domain/saveSlimming.js
// Generic character-save item projection. Shared item containers and the
// stable instance fields are handled here; setting-owned containers and extra
// per-item fields are supplied by the active package's save/inventory services.

import { getSettingService } from './registry.js';

/**
 * Engine-neutral item instance fields that must survive a save round trip.
 * Setting-specific fields are declared by services.inventory.itemSaveStateFields.
 */
export const SAVE_STATE_FIELDS = new Set([
  'id',
  'instanceId',
  'itemType',
  'quantity',
  'equipped',
  'locked',
  'stackKey',
  'equipInstanceId',
  'uniqueId',
]);

const getSaveStateFields = () => {
  const declaredFields = getSettingService('inventory')?.itemSaveStateFields;
  return new Set([
    ...SAVE_STATE_FIELDS,
    ...(Array.isArray(declaredFields)
      ? declaredFields.filter((field) => typeof field === 'string')
      : []),
  ]);
};

/**
 * Ужать один инстанс предмета.
 * @param {object} instance — запись из сейва (может быть «жирной»).
 * @param {object|null} entry — каталожная запись по id (или null, если нет в каталоге).
 * @param {Set<string>} stateFields — generic и setting-owned instance fields.
 * @returns {object} «худой» инстанс.
 */
export const slimItem = (instance, entry, stateFields = getSaveStateFields()) => {
  if (!instance || typeof instance !== 'object') return instance;
  // Нет каталожной записи (кастом/стаб/встроенное содержимое) → не трогаем,
  // чтобы не потерять локальные имя/вес/цену.
  if (!entry || typeof entry !== 'object') return { ...instance };

  const allowedFields = stateFields instanceof Set ? stateFields : new Set(stateFields || []);
  return Object.fromEntries(Object.entries(instance)
    .filter(([key]) => allowedFields.has(key)));
};

/**
 * Восстановить один инстанс каталожными данными.
 * resolve(instance) — обычно domain/resolveItem#resolveItem(instance, catalog).
 * Слияние { ...instance, ...resolved } сохраняет все поля инстанса и
 * замещает каталожные данные корректными данными каталога/модов.
 * Если записи в каталоге нет — item не изменится.
 */
export const restoreItem = (instance, resolve) => {
  if (!instance || typeof instance !== 'object') return instance;
  const resolved = typeof resolve === 'function' ? resolve(instance) : instance;
  if (!resolved || typeof resolved !== 'object') return { ...instance };
  return { ...instance, ...resolved };
};

const mapArray = (arr, fn) => (Array.isArray(arr) ? arr.map(fn) : arr);

/** Map the shared, setting-neutral item containers. */
const mapCommonItemContainers = (data, fn) => {
  if (!data || typeof data !== 'object') return data;
  const next = { ...data };

  if (next.equipment && typeof next.equipment === 'object') {
    next.equipment = {
      ...next.equipment,
      items: mapArray(next.equipment.items, fn),
    };
  }

  if (Array.isArray(next.equippedWeapons)) {
    next.equippedWeapons = mapArray(next.equippedWeapons, fn);
  }

  if (next.equippedArmor && typeof next.equippedArmor === 'object') {
    const out = {};
    for (const [key, slot] of Object.entries(next.equippedArmor)) {
      if (!slot || typeof slot !== 'object') {
        out[key] = slot;
        continue;
      }
      const mappedSlot = { ...slot };
      if (mappedSlot.armor) mappedSlot.armor = fn(mappedSlot.armor);
      if (mappedSlot.clothing) mappedSlot.clothing = fn(mappedSlot.clothing);
      out[key] = mappedSlot;
    }
    next.equippedArmor = out;
  }

  return next;
};

/**
 * Let the active setting traverse its own save containers without teaching the
 * engine their keys or nested payload shape.
 */
const mapSettingItemContainers = (data, fn) => {
  const map = getSettingService('characterSave')?.mapItemContainers;
  return typeof map === 'function' ? map(data, fn) : data;
};

const mapItemContainers = (data, fn) => mapSettingItemContainers(
  mapCommonItemContainers(data, fn),
  fn,
);

const slimSettingContainers = (data) => {
  const slim = getSettingService('characterSave')?.slimSettingContainers;
  return typeof slim === 'function' ? slim(data) : data;
};

/**
 * Ужать тело сейва на экспорте.
 * @param {object} data — character.data (или уже сериализованный объект).
 * @param {object} deps — { getEntry(id, itemType): catalogEntry|null }.
 * @returns {object}
 */
export const slimSaveData = (data, { getEntry } = {}) => {
  const lookup = typeof getEntry === 'function' ? getEntry : () => null;
  const getCatalogItemId = getSettingService('inventory')?.getCatalogItemId;
  const stateFields = getSaveStateFields();
  const slimmed = mapItemContainers(data, (item) => {
    if (!item || typeof item !== 'object') return item;
    const settingItemId = typeof getCatalogItemId === 'function' ? getCatalogItemId(item) : null;
    const id = settingItemId || item.id;
    const entry = id ? lookup(id, item.itemType) : null;
    return slimItem(item, entry, stateFields);
  });
  return slimSettingContainers(slimmed);
};

/**
 * Восстановить тело сейва на импорте.
 * @param {object} data — character.data (возможно «худой»).
 * @param {object} deps — { resolve(instance): resolvedInstance }.
 * @returns {object}
 */
export const restoreSaveData = (data, { resolve } = {}) => {
  const run = typeof resolve === 'function' ? resolve : (item) => item;
  return mapItemContainers(data, (item) => restoreItem(item, run));
};
