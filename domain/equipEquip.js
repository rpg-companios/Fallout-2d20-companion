// domain/equipEquip.js
// Pure functions for equip eligibility checks.
// No React, no UI dependencies. All reason strings are i18n keys.
//
// Политика определяется фичи-профилем (fitProfile) на characterType/origin
// (см. domain/itemfit.js + domain/itemfitRules.js). Прежняя цепочка
// origins.armorPolicy → getArmorPolicy → canEquip* → allowlist УДАЛЕНА:
//   - domain/allowlist.js (isItemInAllowlist) не используется;
//   - modules/fallout/data/allowlist/robotOnly.js / mutantOnly.js не используются.
//
// Эти функции сохранены как УДОБНЫЕ ОБЁРТКИ над isItemAllowed(item, action,
// character), чтобы не менять публичный API вызывающих (InventoryScreen,
// CharacterContext). «Наличие руки» у робота для оружия проверяется отдельно в
// слот/body-plan слое (domain/robotEquip.js) — здесь только статичный вопрос.

import { getAttributeValue, getEquipmentCarryWeightModifier } from './characterCreation';
import { isRobotCharacter } from './origins';
import { isItemAllowed, ACTIONS } from './itemfitRules';

/** True if the item is power armor (frame or piece). */
export const isPowerArmorItem = (item) =>
  Boolean(item?.itemType === 'powerArmor' || String(item?.id || '').startsWith('power_armor_'));

/** Причина запрета для алерта (различаем роботов и остальных архетипов). */
const denyReason = (character, reasonIfRobot, reasonElse) =>
  isRobotCharacter(character) ? reasonIfRobot : reasonElse;

/**
 * Check whether a character can equip a given armor item.
 */
export function canEquipArmor(armorItem, character) {
  if (isItemAllowed(armorItem, ACTIONS.EQUIP, character)) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: denyReason(character, 'equip.error.robotCannotWearStandardArmor', 'equip.error.mutantCannotWearStandardArmor'),
  };
}

/**
 * Check whether a character can equip a given weapon item.
 * Роботы могут использовать стандартное оружие при наличии руки (проверка в
 * InventoryScreen/findFreeWeaponHand) — здесь статично разрешаем; запрет — если
 * предмет вообще не подходит архетипу (например, человеку — робо-оружие).
 */
export function canEquipWeapon(weaponItem, character) {
  if (isItemAllowed(weaponItem, ACTIONS.EQUIP, character)) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: denyReason(character, 'equip.error.robotCannotUseStandardWeapon', 'equip.error.robotOnlyWeapon') };
}

export function canEquipClothing(clothingItem, character) {
  if (isItemAllowed(clothingItem, ACTIONS.EQUIP, character)) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: 'equip.error.robotCannotWearClothing' };
}

/**
 * Power armor equip check — через fitProfile (силовая броня — itemType
 * 'powerArmor', входит в категорию humanArmor; мутантам/роботам запрещена).
 */
export function canEquipPowerArmor(powerArmorItem, character) {
  if (isItemAllowed(powerArmorItem, ACTIONS.EQUIP, character)) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: denyReason(character, 'equip.error.robotCannotWearStandardArmor', 'equip.error.mutantCannotWearStandardArmor'),
  };
}

export function filterAvailableArmor(allArmor, character) {
  if (!Array.isArray(allArmor)) return [];
  return allArmor.filter((item) => canEquipArmor(item, character).allowed);
}

export function getCarryWeightLimit(character) {
  const { trait, attributes } = character || {};

  if (isRobotCharacter(character)) {
    return (trait?.modifiers?.carryWeightFixed ?? 150) + getEquipmentCarryWeightModifier(character);
  }

  const str = getAttributeValue(attributes || [], 'STR');
  const multiplier = trait?.modifiers?.carryWeightStrengthMultiplier ?? 10;
  return 150 + str * multiplier + getEquipmentCarryWeightModifier(character);
}
