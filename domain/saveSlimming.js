// domain/saveSlimming.js
// Ужиматель/восстановитель «тела» сейва персонажа (character.data).
//
// ЦЕЛЬ.
//   Сейв должен хранить ТОЛЬКО состояние экземпляра предмета (см. INSTANCE/SAVE_STATE_FIELDS),
//   а имя/цену/вес/редкость/статы/качества/эффекты код достаёт из каталога через
//   domain/resolveItem.js («Каталог = источник истины»). Это:
//     - делает файл заметно легче (в сейве нет дублей каталога);
//     - убирает «дрейф» — правки JSON применяются к уже созданным персонажам;
//     - пере-локализует имена под текущий язык программы.
//
// ПОЧЕМУ ДВА ПРОХОДА (а не только миграция).
//   Часть потребителей читает поля предмета напрямую из состояния, поэтому:
//     - на ЭКСПОРТЕ  (saveCharacter / автосейв) — УЖИМАЕМ → файл/БД худые;
//     - на ИМПОРТЕ  (deserializeState)          — ВОССТАНАВЛИВАЕМ → состояние снова полное.
//   Так нет регрессий в рендере, а на диске сейв лёгкий.
//
// БЕЗОПАСНОСТЬ (обратная совместимость).
//   Поле вырезается ТОЛЬКО если у id есть каталожная запись, И эта запись
//   реально «владеет» полем (key in catalogEntry). Иначе инстанс сохраняется
//   целиком — кастом/стабы вроде trinkets_stub_2 («Заглючивший голодиск»),
//   у которых в каталоге нет имени/веса/цены, не теряют данных.
//
// МОДУЛЬ ЧИСТЫЙ: каталог и функции поиска/разрешения ПЕРЕДАЮТСЯ как зависимости
// (см. контракт resolveItem), поэтому его можно тестировать с синтетическим
// каталогом без подключения modules/fallout.

/**
 * Поля СОСТОЯНИЯ экземпляра, которые ОБЯЗАНЫ переживать сейв↔загрузку.
 * Надмножество INSTANCE_FIELDS из domain/resolveItem.js: добавляет instanceId,
 * requiresMkII и т.п., чтобы ничего не терять при восстановлении.
 */
export const SAVE_STATE_FIELDS = new Set([
  // идентификаторы / ключ экземпляра
  'id', 'instanceId', 'weaponId', 'code', 'Name',
  // тип и состояние инвентаря
  'itemType', 'quantity', 'equipped', 'locked', 'requiresMkII',
  // моды и подпись стопки
  'appliedMods', 'stackKey',
  'appliedArmorModId', 'appliedUniqueArmorModId', 'appliedClothingModId',
  // прочность / заряды / HP
  'durabilityTracked', 'durability', 'durabilityAmmoRemainder', 'durabilityWearRemainder',
  'equipInstanceId', 'uniqueId', 'charges', 'hpCurrent',
  // мета отображения / роботов
  'sourceSlot', 'isBuiltin', 'isManipulator', 'isEquipped',
]);

/**
 * Ужать один инстанс предмета.
 * @param {object} instance      — запись из сейва (может быть «жирной»).
 * @param {object|null} entry    — каталожная запись по id (или null, если нет в каталоге).
 * @returns {object}             — «худой» инстанс.
 */
export const slimItem = (instance, entry) => {
  if (!instance || typeof instance !== 'object') return instance;
  // Нет каталожной записи (кастом/стаб/робо-встроенное оружие) → не трогаем,
  // чтобы не потерять «локальные» имя/вес/цену.
  if (!entry || typeof entry !== 'object') return { ...instance };

  const out = {};
  for (const key of Object.keys(instance)) {
    if (SAVE_STATE_FIELDS.has(key)) {
      out[key] = instance[key];
      continue;
    }
    // Поле «владеет» каталог → выводимо через resolveItem → вырезаем.
    // Иначе (каталог не знает такого поля) оставляем как fallback.
    const catalogOwns = Object.prototype.hasOwnProperty.call(entry, key);
    if (!catalogOwns) out[key] = instance[key];
  }
  return out;
};

/**
 * Восстановить один инстанс каталожными данными.
 * resolve(instance) — обычно domain/resolveItem#resolveItem(instance, catalog).
 * Слияние { ...instance, ...resolved } сохраняет все поля инстанса (в т.ч.
 * instanceId/requiresMkII, которые resolveItem может не вернуть) и
 * замещает «жирные» поля корректными данными каталога/модов.
 * Если записи в каталоге нет — item не изменится (никаких потерь).
 */
export const restoreItem = (instance, resolve) => {
  if (!instance || typeof instance !== 'object') return instance;
  const resolved = typeof resolve === 'function' ? resolve(instance) : instance;
  if (!resolved || typeof resolved !== 'object') return { ...instance };
  return { ...instance, ...resolved };
};

const mapArray = (arr, fn) => (Array.isArray(arr) ? arr.map(fn) : arr);

/**
 * Обход всех контейнеров предметов в data + применение fn к каждому инстансу.
 * Контейнеры: equipment.items, equippedWeapons, equippedArmor.*.{armor,clothing},
 * equippedPowerArmor.{frame,pieces.*}, equippedRobotSlots.*.heldWeapon.
 * Слои роботов (limb/armor/plating/frame) на этом шаге НЕ трогаются — их
 * восстановление требует отдельной проверки каталога робочастей (см. доки).
 */
const mapItemContainers = (data, fn) => {
  if (!data || typeof data !== 'object') return data;
  const next = { ...data };

  // equipment.items
  if (next.equipment && typeof next.equipment === 'object') {
    next.equipment = {
      ...next.equipment,
      items: mapArray(next.equipment.items, fn),
    };
  }

  // equippedWeapons
  if (Array.isArray(next.equippedWeapons)) {
    next.equippedWeapons = mapArray(next.equippedWeapons, fn);
  }

  // equippedArmor — { head:{armor,clothing}, body:{...}, leftArm:{...}, ... }
  if (next.equippedArmor && typeof next.equippedArmor === 'object') {
    const slots = next.equippedArmor;
    const out = {};
    for (const [k, slot] of Object.entries(slots)) {
      if (!slot || typeof slot !== 'object') { out[k] = slot; continue; }
      const s = { ...slot };
      if (s.armor) s.armor = fn(s.armor);
      if (s.clothing) s.clothing = fn(s.clothing);
      out[k] = s;
    }
    next.equippedArmor = out;
  }

  // equippedPowerArmor — { frame, pieces:{head,body,leftArm,rightArm,leftLeg,rightLeg} }
  if (next.equippedPowerArmor && typeof next.equippedPowerArmor === 'object') {
    const pa = { ...next.equippedPowerArmor };
    if (pa.frame) pa.frame = fn(pa.frame);
    if (pa.pieces && typeof pa.pieces === 'object') {
      const pieces = {};
      for (const [k, v] of Object.entries(pa.pieces)) pieces[k] = fn(v);
      pa.pieces = pieces;
    }
    next.equippedPowerArmor = pa;
  }

  // equippedRobotSlots — ужимаем только heldWeapon (оружие в «руке»)
  if (next.equippedRobotSlots && typeof next.equippedRobotSlots === 'object') {
    const slots = next.equippedRobotSlots;
    const out = {};
    for (const [k, slot] of Object.entries(slots)) {
      if (!slot || typeof slot !== 'object') { out[k] = slot; continue; }
      const s = { ...slot };
      if (s.heldWeapon) s.heldWeapon = fn(s.heldWeapon);
      out[k] = s;
    }
    next.equippedRobotSlots = out;
  }

  return next;
};

/**
 * Ужать тело сейва на экспорте.
 * @param {object} data      — character.data (или уже сериализованный объект).
 * @param {object} deps      — { getEntry(id, itemType): catalogEntry|null }.
 * @returns {object}
 */
export const slimSaveData = (data, { getEntry } = {}) => {
  const lookup = typeof getEntry === 'function' ? getEntry : () => null;
  return mapItemContainers(data, (item) => {
    if (!item || typeof item !== 'object') return item;
    const id = item.weaponId || item.id;
    const entry = id ? lookup(id, item.itemType) : null;
    return slimItem(item, entry);
  });
};

/**
 * Восстановить тело сейва на импорте.
 * @param {object} data      — character.data (возможно «худой»).
 * @param {object} deps      — { resolve(instance): resolvedInstance }.
 * @returns {object}
 */
export const restoreSaveData = (data, { resolve } = {}) => {
  const run = typeof resolve === 'function' ? resolve : (item) => item;
  return mapItemContainers(data, (item) => restoreItem(item, run));
};
