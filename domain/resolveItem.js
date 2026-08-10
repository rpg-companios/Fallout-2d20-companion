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
// Модифицированное оружие детализирует findLocalizedWeapon (свои пересчёты статов),
// а моды брони — applyArmorMods; resolveItem их не касается.
const INSTANCE_FIELDS = [
  'id', 'weaponId', 'code', 'Name',          // идентификаторы / ключ экземпляра
  'itemType',                                 // тип хранится на инстансе
  'quantity', 'equipped', 'locked',           // состояние инвентаря
  'appliedMods', 'stackKey',                  // моды и подпись стопки
  'equipInstanceId', 'uniqueId',              // идентификаторы экипировки
  'charges', 'hpCurrent',                     // заряд Ядерного Блока / прочность части СБ
  'sourceSlot', 'isBuiltin', 'isManipulator', 'isEquipped', // мета отображения / роботов
];

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
  const base = findCatalogEntry(catalog, instance.id, itemType);
  if (!base) return instance;
  const instanceState = {};
  INSTANCE_FIELDS.forEach((f) => { if (instance[f] !== undefined) instanceState[f] = instance[f]; });
  return { ...base, ...instanceState, name: base.name };
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
