// domain/equipEquip.js
// Pure functions for equip eligibility checks — IRON RULES for robots/mutants.
// No React, no UI dependencies. All reason strings are i18n keys.
//
// Armor policy and character archetype now live in domain/origins.js
// (characterType drives the default policy; origin.armorPolicy overrides).
//
// Домен — движок где общие правила. Частный случай (что именно может носить робот) — вне домена.
// - Общая движковая функция белого списка: domain/allowlist.js isItemInAllowlist()
// - Частные списки: modules/fallout/data/allowlist/robotOnly.js, mutantOnly.js
//   Просто список id и/или категорий: robotOnly:{ robotArmor, robotPlating, robotFrame, robotLims, robotWeapons, fancyHat, ... }

import { getAttributeValue, getEquipmentCarryWeightModifier } from './characterCreation';
import { ARMOR_POLICIES, getArmorPolicy, isRobotCharacter } from './origins';
import { isItemInAllowlist } from './allowlist';
// Частные списки — вне домена (private case), импортируются сюда для применения общего правила
import { robotOnly as ROBOT_ONLY_DICT, ROBOT_ONLY_STRUCTURED } from '../modules/fallout/data/allowlist/robotOnly';
import { mutantOnly as MUTANT_ONLY_DICT, MUTANT_ONLY_STRUCTURED } from '../modules/fallout/data/allowlist/mutantOnly';

/** True if the item is power armor (frame or piece). */
export const isPowerArmorItem = (item) =>
  Boolean(item?.itemType === 'powerArmor' || String(item?.id || '').startsWith('power_armor_'));

/** True if the weapon comes from robot weapons catalog (whitelist for robots). */
const isRobotOnlyWeapon = (weaponItem) =>
  Boolean(
    weaponItem?.isRobotWeapon
    || weaponItem?.robotOnly
    || String(weaponItem?.id || '').startsWith('robot_weapon_')
    || String(weaponItem?.id || '').startsWith('robot_arm_')
  );

/** Проверка: входит ли предмет в белый список роботов (частный случай через общий движок) */
function isRobotAllowed(item, character = null) {
  // 1. Инжект через трейт/ориджин (owner-only мега-случай): character.origin.robotOnly или trait.robotOnly
  const injectedAllowlist = character?.origin?.robotOnly || character?.trait?.robotOnly || character?.origin?.allowlist || null;
  if (injectedAllowlist && isItemInAllowlist(item, injectedAllowlist)) return true;

  // 2. Глобальный белый список роботов (частный случай в данных)
  if (isItemInAllowlist(item, ROBOT_ONLY_DICT)) return true;
  if (isItemInAllowlist(item, ROBOT_ONLY_STRUCTURED)) return true;

  return false;
}

function isMutantAllowed(item, character = null) {
  const injectedAllowlist = character?.origin?.mutantOnly || character?.trait?.mutantOnly || null;
  if (injectedAllowlist && isItemInAllowlist(item, injectedAllowlist)) return true;

  if (isItemInAllowlist(item, MUTANT_ONLY_DICT)) return true;
  if (isItemInAllowlist(item, MUTANT_ONLY_STRUCTURED)) return true;

  // Legacy flag на предмете
  if (item?.mutantOnly === true) return true;

  return false;
}

/** Для совместимости — теперь через общий allowlist */
const isRobotDecorativeHat = (clothingItem) => isRobotAllowed(clothingItem);

/**
 * Check whether a character can equip a given armor item.
 *
 * WHITELIST PRINCIPLE (owner):
 *  - ROBOT_ONLY: allowed ONLY if item in robotOnly allowlist (domain/allowlist.js engine + data/allowlist/robotOnly.js private)
 *  - RAIDER_ONLY: allowed ONLY if item in mutantOnly allowlist
 *  - STANDARD: allowed if NOT in robot/mutant allowlists
 */
export function canEquipArmor(armorItem, character) {
  const policy = getArmorPolicy(character);
  const robotAllowed = isRobotAllowed(armorItem, character);
  const mutantAllowed = isMutantAllowed(armorItem, character);

  if (policy === ARMOR_POLICIES.ROBOT_ONLY) {
    if (!robotAllowed) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (policy === ARMOR_POLICIES.RAIDER_ONLY) {
    if (!mutantAllowed) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (robotAllowed) {
    return { allowed: false, reason: 'equip.error.cannotWearRobotArmor' };
  }
  if (mutantAllowed) {
    return { allowed: false, reason: 'equip.error.cannotWearMutantArmor' };
  }

  return { allowed: true, reason: null };
}

/**
 * Check whether a character can equip a given weapon item.
 *
 * Rules (updated per owner clarification allow_standard_with_arm):
 *  - Robot-only weapon + non-robot character -> blocked (humans cannot use robot weapons)
 *  - Standard weapon + robot character -> ALLOWED, but actual equip via inventory
 *    requires arm with canHoldWeapons=true (enforced in InventoryScreen, not here)
 *    This allows Mister Handy / etc with manipulator to pick up 10mm pistol.
 *  - Everything else -> allowed.
 */
export function canEquipWeapon(weaponItem, character) {
  const policy = getArmorPolicy(character);
  const isRobotChar = policy === ARMOR_POLICIES.ROBOT_ONLY;
  const isRobotWeapon = isRobotOnlyWeapon(weaponItem);

  if (isRobotWeapon && !isRobotChar) {
    return { allowed: false, reason: 'equip.error.robotOnlyWeapon' };
  }

  // Robots can use standard weapons if they have a holding arm — check is in InventoryScreen (findFreeWeaponHand)
  // So we allow here, UI will hide button if no arm.

  return { allowed: true, reason: null };
}

export function canEquipClothing(clothingItem, character) {
  const policy = getArmorPolicy(character);
  const isRobotChar = policy === ARMOR_POLICIES.ROBOT_ONLY;
  const isMutantChar = policy === ARMOR_POLICIES.RAIDER_ONLY;

  if (isRobotChar) {
    if (!isRobotAllowed(clothingItem, character)) {
      return { allowed: false, reason: 'equip.error.robotCannotWearClothing' };
    }
    return { allowed: true, reason: null };
  }

  if (isMutantChar) {
    if (!isMutantAllowed(clothingItem, character)) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (isRobotAllowed(clothingItem, character)) {
    return { allowed: false, reason: 'equip.error.cannotWearRobotArmor' };
  }
  if (isMutantAllowed(clothingItem, character)) {
    return { allowed: false, reason: 'equip.error.cannotWearMutantArmor' };
  }

  return { allowed: true, reason: null };
}

/**
 * Power armor equip check — WHITELIST PRINCIPLE.
 * Частный список вне домена, движок — domain/allowlist.js
 */
export function canEquipPowerArmor(powerArmorItem, character) {
  const policy = getArmorPolicy(character);
  const robotAllowed = isRobotAllowed(powerArmorItem, character);
  const mutantAllowed = isMutantAllowed(powerArmorItem, character);

  if (policy === ARMOR_POLICIES.ROBOT_ONLY) {
    if (!robotAllowed) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }
  if (policy === ARMOR_POLICIES.RAIDER_ONLY) {
    if (!mutantAllowed) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (robotAllowed) {
    return { allowed: false, reason: 'equip.error.cannotWearRobotArmor' };
  }
  if (mutantAllowed) {
    return { allowed: false, reason: 'equip.error.cannotWearMutantArmor' };
  }

  return { allowed: true, reason: null };
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
