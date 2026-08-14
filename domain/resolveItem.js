// domain/resolveItem.js
//
// Единая точка обогащения предметов из каталога (JSON = источник истины).
//
// Контракт (см. docs и db/schema.js: «Справочники живут в JSON»):
//   - в сторе/сейве предмет хранится как ССЫЛКА — { id, itemType, quantity,
//     equipped, locked, appliedMods, stackKey, equipInstanceId, charges, hpCurrent };
//   - вес/цена/эффект/имя НЕ хранятся — их достаёт отсюда resolveItem() по id.
//
// Все экраны и счётчики веса/цены должны идти через эти функции, чтобы не было
// разнобоя (поле `value` у хлама, «забыли обогатить» и т.п.).
//
// Модуль чистый: каталог передаётся аргументом (getEquipmentCatalog(locale)),
// никаких RN-зависимостей.

import { applyArmorMods } from './modsEquip.js';

// itemType, когда у предмета нет явного itemType (для запасных/старых записей).
export const inferItemType = (item) => {
  if (!item) return 'misc';
  if (item.itemType) return item.itemType;
  if (item.effectType || item.durationInScenes || item.duration || item.positiveEffect) return 'chem';
  if (item.type === 'ammo') return 'ammo';
  if (item.weaponId || item.damage !== undefined) return 'weapon';
  if (item.clothingType) return 'clothing';
  if (item.protectedAreas) return 'armor';
  return 'misc';
};

// miscellaneous может быть как массивом, так и { miscellaneous: [{items:[]}] }.
const flattenMisc = (misc) =>
  Array.isArray(misc)
    ? misc
    : (misc?.miscellaneous || []).flatMap((group) => group?.items || []);

/**
 * Найти каталожную запись предмета по id и типу.
 * Объединяет прежние findInCatalog (skillRewards) и lookup-ветки
 * resolveLocalizedItem (InventoryScreen) / resolveItemById (kitResolver).
 *
 * @param {object} catalog  — getEquipmentCatalog(locale)
 * @param {string} id       — канонический id предмета
 * @param {string} itemType — тип (если неизвестен — fallback в misc)
 * @returns {object|null}
 */
export const findCatalogEntry = (catalog, id, itemType) => {
  if (!id || !catalog) return null;
  const search = (arr) => (arr || []).find((e) => e && e.id === id) || null;
  switch (itemType) {
    case 'weapon':
      return search(catalog.weapons);
    case 'ammo':
      return search(catalog.ammoTypes);
    case 'armor':
      return catalog.armorIndex?.byId?.get(id) || null;
    case 'clothing':
    case 'outfit': {
      const all = (catalog.clothes?.clothes || []).flatMap((g) => g.items || []);
      return search(all);
    }
    case 'chem':
    case 'chems':
      return search(catalog.chems);
    case 'drinks':
      return search(catalog.drinks);
    case 'food':
      return search(catalog.food);
    case 'magazine':
      return search(catalog.magazines);
    case 'powerArmor':
      // Силовая броня: каркас, части, ядерный блок — плоский список.
      return search(catalog.powerArmorList);
    case 'robotArm':
      return search(catalog.robotArms);
    case 'robotBody':
      return search(catalog.robotBody);
    case 'robotLeg':
    case 'robotLegs':
      return search(catalog.robotLegs);
    case 'robotHead':
      return search(catalog.robotHeads);
    case 'robotPart':
      // Универсальный поиск по любым робочастям.
      return search(catalog.robotArms)
        || search(catalog.robotBody)
        || search(catalog.robotLegs)
        || search(catalog.robotHeads)
        || search(catalog.robotPlating)
        || search(catalog.robotFrames);
    case 'misc':
    default: {
      const misc = flattenMisc(catalog.miscellaneous);
      return search(misc)
        || search(catalog.generalGoods)
        || search(catalog.oddities)
        || search(catalog.robotModules)
        || search(catalog.robotItems);
    }
  }
};

// Поля СОСТОЯНИЯ экземпляра — берутся из инстанса (стора/сейва), НЕ из каталога.
// Всё остальное (вес, цена, эффект, статы, имя, зоны защиты, rarity…) — из каталога,
// чтобы правки данных JSON применялись сразу и не перекрывались устаревшим инстансом.
// Производные поля (моды оружия/брони) считаются после обогащения из каталога:
// в состоянии хранится только выбор модов, а не скопированные характеристики.
const INSTANCE_FIELDS = [
  'id', 'weaponId', 'code', 'Name',          // идентификаторы / ключ экземпляра
  'itemType',                                 // тип хранится на инстансе
  'quantity', 'equipped', 'locked',           // состояние инвентаря
  'appliedMods', 'stackKey',                  // моды и подпись стопки
  'appliedArmorModId', 'appliedUniqueArmorModId', 'appliedClothingModId',
  'durabilityTracked', 'durability', 'durabilityAmmoRemainder', 'durabilityWearRemainder',
  'equipInstanceId', 'uniqueId',              // идентификаторы экипировки
  'charges', 'hpCurrent',                     // заряд Ядерного Блока / прочность части СБ
  'sourceSlot', 'isBuiltin', 'isManipulator', 'isEquipped', // мета отображения / роботов
];

const getAppliedWeaponMods = (catalog, appliedMods = {}) => {
  const modIds = Object.values(appliedMods).filter(Boolean);
  if (modIds.length === 0) return [];
  const mods = catalog?.weaponMods || [];
  return modIds.map((modId) => mods.find((mod) => mod?.id === modId)).filter(Boolean);
};

const getWeaponNameWithAppliedMods = (weapon, selectedMods) => {
  const baseName = weapon?.baseName || weapon?.name || weapon?.baseWeaponName || '';
  const prefixes = selectedMods
    .map((mod) => (mod?.prefix || mod?.name || '').trim())
    .filter(Boolean);
  const uniquePrefixes = [...new Set(prefixes)];
  return uniquePrefixes.length ? `${uniquePrefixes.join(' ')} ${baseName}` : baseName;
};

const applyNumberModifier = (baseValue, modifier) => {
  if (!modifier) return baseValue;
  const baseNumber = Number(baseValue) || 0;
  const modValue = Number(modifier.value) || 0;
  if (modifier.op === 'set') return modValue;
  if (modifier.op === '-') return Math.max(0, baseNumber - modValue);
  return baseNumber + modValue;
};

export const resolveWeaponWithAppliedMods = (weapon, catalog) => {
  if (!weapon || !catalog) return weapon;
  const selectedMods = getAppliedWeaponMods(catalog, weapon.appliedMods);
  if (selectedMods.length === 0) return weapon;

  const resolvedWeapon = selectedMods.reduce((resolved, mod) => {
    const next = { ...resolved };
    if (mod.damageModifier) next.damage = applyNumberModifier(next.damage, mod.damageModifier);
    if (mod.fireRateModifier) next.fireRate = applyNumberModifier(next.fireRate, mod.fireRateModifier);
    if (mod.ammoOverride) next.ammoId = mod.ammoOverride;
    if (mod.weight != null) next.weight = Number(next.weight ?? 0) + Number(mod.weight);
    if (mod.cost != null) next.cost = Number(next.cost ?? 0) + Number(mod.cost);
    if (mod.damageTypeOverride?.op === 'set') {
      next.damageType = Array.isArray(mod.damageTypeOverride.value)
        ? [...mod.damageTypeOverride.value]
        : [mod.damageTypeOverride.value];
    }
    return next;
  }, weapon);

  return {
    ...resolvedWeapon,
    name: getWeaponNameWithAppliedMods(weapon, selectedMods),
    baseWeaponName: weapon.baseName || weapon.baseWeaponName || weapon.name,
  };
};

const EFFECTIVE_ITEM_RESOLVERS = {
  weapon: (item, catalog) => resolveWeaponWithAppliedMods(item, catalog),
  armor: (item, catalog) => applyArmorMods(item, catalog).item,
  clothing: (item, catalog) => applyArmorMods(item, catalog, {
    standardKey: 'appliedClothingModId',
    uniqueKey: 'unusedUniqueArmorModId',
  }).item,
  outfit: (item, catalog) => applyArmorMods(item, catalog, {
    standardKey: 'appliedClothingModId',
    uniqueKey: 'unusedUniqueArmorModId',
  }).item,
};

export const resolveEffectiveItem = (item, catalog) => {
  const itemType = item?.itemType || inferItemType(item);
  const resolver = EFFECTIVE_ITEM_RESOLVERS[itemType];
  return resolver ? resolver(item, catalog) : item;
};

/**
 * Обогатить инстанс предмета каталожными данными по id.
 *
 * Каталог = источник истины: каталожные данные (вес/цена/эффект/статы/имя) — из
 * каталога (base); из инстанса — только состояние экземпляра (INSTANCE_FIELDS).
 * Поэтому правки JSON применяются к уже созданным персонажам сразу. Если записи в
 * каталоге нет (модифицированное оружие с id-суффиксом, синтетические id) —
 * инстанс возвращается как есть.
 *
 * @param {object} instance — запись из стора/сейва (минимум: { id, itemType? })
 * @param {object} catalog  — getEquipmentCatalog(locale)
 * @returns {object}
 */
export const resolveItem = (instance, catalog) => {
  if (!instance || !instance.id) return instance;
  const itemType = instance.itemType || inferItemType(instance);
  // Store rows use `id` as the inventory instance key. The catalog id lives in
  // `weaponId` for weapons and most normalized items, so enrichment must look up
  // the catalog by that canonical id instead of the instance key.
  const catalogId = instance.weaponId || instance.id;
  const base = findCatalogEntry(catalog, catalogId, itemType);
  if (!base) return instance;
  const instanceState = {};
  INSTANCE_FIELDS.forEach((f) => { if (instance[f] !== undefined) instanceState[f] = instance[f]; });
  return resolveEffectiveItem({ ...base, ...instanceState, name: base.name }, catalog);
};

/**
 * Цена предмета. каталог использует cost, общие товары — value; price — запасной.
 * Единое место, чтобы не было «хлам показывает 0».
 */
export const getItemPrice = (item) =>
  parseFloat(item?.cost ?? item?.price ?? item?.value) || 0;

/** Вес предмета (перенос запятой → точка, как было в InventoryScreen). */
export const getItemWeight = (item) =>
  parseFloat(String(item?.weight ?? 0).replace(',', '.')) || 0;
