// domain/kitEquip.js
// Правило выдачи комплекта: что вообще МОЖЕТ быть надето.
//
// У роботов предметы комплекта выдаются надетыми и запертыми (снять можно
// только сменой конечности). Но «надеть» осмысленно лишь для того, что
// занимает слот: оружие, броня, одежда, силовая броня. Стимпак, еда, патроны
// и хлам слот не занимают — им флаг `equipped` не нужен.
//
// Раньше робот получал ВЕСЬ комплект как надетый, и стимпаки висели в
// экипировке запертыми: использовать нельзя, снять нельзя.

/** Типы, которые занимают слот и могут быть надеты. */
export const EQUIPPABLE_ITEM_TYPES = new Set([
  'weapon',
  'armor',
  'clothing',
  'powerArmor',
]);

/**
 * Может ли предмет быть надет.
 *
 * Роботские конечности и встроенные модули приходят со своими маркерами
 * (`isBuiltin`, `isManipulator`, `sourceSlot`) и слот занимают — их тоже
 * считаем надеваемыми, иначе встроенное оружие робота окажется в рюкзаке.
 *
 * @param {object} item
 * @returns {boolean}
 */
export const isEquippableKitItem = (item) => {
  if (!item || typeof item !== 'object') return false;
  if (item.isBuiltin === true || item.isManipulator === true) return true;
  return EQUIPPABLE_ITEM_TYPES.has(item.itemType);
};

/**
 * Флаги выдачи предмета из комплекта.
 *
 * Человек получает всё не надетым — надевает сам. Робот получает надетым и
 * запертым только то, что занимает слот; расходники ложатся в инвентарь
 * обычными, чтобы ими можно было пользоваться.
 *
 * @param {object} item
 * @param {boolean} isRobot
 * @returns {{ equipped: boolean, locked: boolean }}
 */
export const resolveKitItemEquipState = (item, isRobot) => {
  const equip = Boolean(isRobot) && isEquippableKitItem(item);
  return { equipped: equip, locked: equip };
};
