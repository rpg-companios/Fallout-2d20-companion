// domain/equipEquip.js
// Pure functions for equip eligibility checks — IRON RULES for robots/mutants.
// No React, no UI dependencies. All reason strings are i18n keys.
//
// Armor policy and character archetype now live in domain/origins.js
// (characterType drives the default policy; origin.armorPolicy overrides).
//
// IRON RULES (see docs/robot-rules.md) — WHITELIST PRINCIPLE (owner):
// - robotOnly describes WHAT robot CAN wear. Forbidden = not allowed.
// - mutantOnly describes WHAT mutant CAN wear.
// - If power armor is not in robotOnly options, there is no equip flag/check for it.
// - Want robot to wear jacket? Set jacket.robotOnly=true. Bandana? bandana.robotOnly=true.
// - Mega case: robot in power armor → via trait/origin flag injected into robotOnly (owner-only unique case).

import { getAttributeValue, getEquipmentCarryWeightModifier } from './characterCreation';
import { ARMOR_POLICIES, getArmorPolicy, isRobotCharacter } from './origins';

/** True if the item is marked as robot-wearable (whitelist). */
const isRobotAllowedItem = (item) =>
  Boolean(
    item?.robotOnly
    || item?.robotArmorType
    || item?.canRobotWear // backward compat for hats that have canRobotWear but not robotOnly yet
  );

/** True if the armor item is robot-specific (for armor slot). */
const isRobotArmor = (armorItem) =>
  Boolean(armorItem?.robotOnly || armorItem?.robotArmorType || armorItem?.canRobotWear);

/** True if the item is mutant/raider restricted (whitelist). */
const isMutantAllowedItem = (item) => Boolean(item?.mutantOnly);
const isMutantArmor = (armorItem) => Boolean(armorItem?.mutantOnly);

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

/**
 * Robots may wear only items marked robotOnly (whitelist).
 * No hardcoded hat list — if you want robot to wear jacket/bandana, set jacket.robotOnly=true.
 * Backward compat: canRobotWear is treated as robotOnly for existing hats.
 */
const isRobotDecorativeHat = (clothingItem) => {
  // Whitelist principle: robot can wear clothing if it has robotOnly or canRobotWear
  return Boolean(clothingItem?.robotOnly || clothingItem?.canRobotWear);
};

/**
 * Check whether a character can equip a given armor item.
 *
 * WHITELIST PRINCIPLE (owner):
 *  - ROBOT_ONLY: allowed ONLY if item.robotOnly (or robotArmorType/canRobotWear) — what is in options is allowed.
 *    If power armor not in robotOnly, no equip flag/check for it.
 *  - RAIDER_ONLY: allowed ONLY if item.mutantOnly
 *  - STANDARD: allowed if NOT robotOnly AND NOT mutantOnly
 */
export function canEquipArmor(armorItem, character) {
  const policy = getArmorPolicy(character);
  const robotAllowed = isRobotAllowedItem(armorItem);
  const mutantAllowed = isMutantAllowedItem(armorItem);

  if (policy === ARMOR_POLICIES.ROBOT_ONLY) {
    // Whitelist: only what is marked robotOnly is allowed, everything else forbidden
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

  // STANDARD (human, ghoul, etc): cannot wear robot or mutant items
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
    // Whitelist: robot can wear clothing only if it has robotOnly (or canRobotWear for backward compat)
    // Want robot to wear jacket/bandana? Set jacket.robotOnly=true
    if (!isRobotAllowedItem(clothingItem)) {
      return { allowed: false, reason: 'equip.error.robotCannotWearClothing' };
    }
    return { allowed: true, reason: null };
  }

  if (isMutantChar) {
    if (!isMutantAllowedItem(clothingItem)) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  // STANDARD: cannot wear robot/mutant clothing
  if (isRobotAllowedItem(clothingItem)) {
    return { allowed: false, reason: 'equip.error.cannotWearRobotArmor' };
  }
  if (isMutantAllowedItem(clothingItem)) {
    return { allowed: false, reason: 'equip.error.cannotWearMutantArmor' };
  }

  return { allowed: true, reason: null };
}

/**
 * Power armor equip check — WHITELIST PRINCIPLE.
 * - ROBOT_ONLY: allowed only if powerArmorItem.robotOnly (injected via trait/origin for mega case)
 * - RAIDER_ONLY: allowed only if mutantOnly
 * - STANDARD: allowed if not robot/mutant
 */
export function canEquipPowerArmor(powerArmorItem, character) {
  const policy = getArmorPolicy(character);
  const robotAllowed = isRobotAllowedItem(powerArmorItem);
  const mutantAllowed = isMutantAllowedItem(powerArmorItem);

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
