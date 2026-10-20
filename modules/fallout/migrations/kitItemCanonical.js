// Канонизация предметов стартовых комплектов с битыми id (дата-баг данных).
//
// История: киты «Изгнанник Братства» (brotherhoodOutcast) и «НCR» (ncr) выдавали
// очищенную воду записью { itemId: 'food_purified_water', itemType: 'food' }.
// Предмета с таким id НЕТ ни в одном каталоге (настоящая вода —
// 'drink_purified_water', каталог drinks). Необогащаемый инстанс:
//   - имя = сырой id, вес/цена/лечение нулевые;
//   - выживание ветвится по itemType 'food' → «пустая еда»: +1 сытости,
//     +0 воды — «вода не снимает жажду» (репорт владельца, 2026-09-11).
//
// Мост (по образцу канонизации навыков, патч 225): при загрузке персонажа
// инстансы с битыми id переименовываются в канонические. Версия схемы сейва
// НЕ меняется — преобразование идемпотентно и безопасно повторять.
//
// Для НОВЫХ персонажей киты починены в данных (itemId: 'drink_purified_water',
// itemType: 'drinks') — мост нужен только старым сейвам.

/**
 * Таблица переименований: битый itemId из китов → канонический предмет.
 * Дополняется по мере обнаружения новых битых ссылок в kit-данных.
 */
export const LEGACY_KIT_ITEM_RENAMES = {
  food_purified_water: { id: 'drink_purified_water', itemType: 'drinks' },
};

/**
 * Переименовать инстанс предмета по таблице. Инстанс без попадания
 * возвращается как есть (тот же объект). У переименованного сбрасывается
 * stackKey (подпись старой «фальшивки» не должна склеиваться с новой стопкой;
 * addNewItem доработает подпись, сравнение стека падает back на id).
 *
 * @param {object} instance — запись инвентаря (минимум: { id }).
 * @returns {object} тот же инстанс или переименованная копия.
 */
export const canonizeKitItemInstance = (instance) => {
  if (!instance || typeof instance !== 'object') return instance;
  const rename = LEGACY_KIT_ITEM_RENAMES[instance.id];
  if (!rename) return instance;
  const { stackKey, ...rest } = instance;
  return { ...rest, id: rename.id, itemType: rename.itemType };
};

/**
 * Канонизация инвентаря загружаемого персонажа. Принимает данные сейва,
 * возвращает НОВУЮ структуру с заменёнными item-ами в equipment.items
 * (сам аргумент не мутируется). Форма сейва не меняется — только id/тип
 * битых инстансов.
 *
 * @param {object} data — распарсенный сейв (после restore/deserialize).
 * @returns {object} сейв с каноническим инвентарём.
 */
export const canonizeLoadedCharacterItems = (data) => {
  const inventory = data?.equipment?.items;
  if (!Array.isArray(inventory)) return data;
  let changed = false;
  const items = inventory.map((instance) => {
    const canon = canonizeKitItemInstance(instance);
    if (canon !== instance) changed = true;
    return canon;
  });
  if (!changed) return data;
  return { ...data, equipment: { ...data.equipment, items } };
};
