// domain/equipEquip.js
// Pure functions for equip eligibility checks — IRON RULES for robots/mutants.
// No React, no UI dependencies. All reason strings are i18n keys.
//
// Armor policy and character archetype now live in domain/origins.js
// (characterType drives the default policy; origin.armorPolicy overrides).
//
// IRON RULES (see docs/robot-rules.md):
// - ROBOT_ONLY can wear ONLY robot armor (robotOnly || robotArmorType) + decorative hats
// - ROBOT_ONLY CANNOT wear power armor, standard armor, mutant armor, standard clothing
// - ROBOT_ONLY: robot weapons (robot_weapon_* / robot_arm_*) as limbs always allowed;
//   standard weapons from inventory allowed ONLY if arm has canHoldWeapons=true (checked in InventoryScreen via findFreeWeaponHand)
// - RAIDER_ONLY (mutant) can wear ONLY mutant armor (mutantOnly)
// - Human cannot wear robot/mutant armor or robot weapons

import { getAttributeValue, getEquipmentCarryWeightModifier } from './characterCreation';
import { ARMOR_POLICIES, getArmorPolicy, isRobotCharacter } from './origins';

/** True if the armor item is robot-specific. */
const isRobotArmor = (armorItem) =>
  Boolean(armorItem?.robotOnly || armorItem?.robotArmorType);

/** True if the armor item is mutant/raider restricted. */
const isMutantArmor = (armorItem) => Boolean(armorItem?.mutantOnly);

/** True if the item is power armor (frame or piece). */
export const isPowerArmorItem = (item) =>
  Boolean(item?.itemType === 'powerArmor' || String(item?.id || '').startsWith('power_armor_'));

/** True if the weapon comes from robot weapons catalog. */
const isRobotOnlyWeapon = (weaponItem) =>
  Boolean(
    weaponItem?.isRobotWeapon
    || String(weaponItem?.id || '').startsWith('robot_weapon_')
    || String(weaponItem?.id || '').startsWith('robot_arm_')
  );

/**
 * Robots may wear only decorative hats on top of their head.
 * Explicitly excludes helmets/hoods/masks/caps-like protective headwear.
 */
const isRobotDecorativeHat = (clothingItem) => {
  if (clothingItem?.clothingType !== 'headwear') return false;
  const id = String(clothingItem?.id || '');

  // Supported hat ids in current catalog.
  return id === 'headwear_casual_hat'
    || id === 'headwear_fancy_hat'
    || id === 'headwear_bos_scribe_hat';
};

/**
 * Check whether a character can equip a given armor item.
 *
 * Policies:
 *  - robotOnly             -> only robot armor, NO power armor
 *  - raiderOnly            -> only mutant-tagged armor, NO power armor
 *  - standard              -> standard + power armor, but no robot/mutant armor
 *
 * Power armor is treated as standard armor for policy purposes — robots and mutants cannot wear it.
 */
export function canEquipArmor(armorItem, character) {
  const policy = getArmorPolicy(character);
  const robotArmor = isRobotArmor(armorItem);
  const mutantArmor = isMutantArmor(armorItem);
  const powerArmor = isPowerArmorItem(armorItem);

  if (policy === ARMOR_POLICIES.ROBOT_ONLY) {
    // Robots cannot wear power armor at all
    if (powerArmor) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    if (!robotArmor) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (policy === ARMOR_POLICIES.RAIDER_ONLY) {
    if (powerArmor) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    if (!mutantArmor) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (robotArmor) {
    return { allowed: false, reason: 'equip.error.cannotWearRobotArmor' };
  }
  if (mutantArmor) {
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

  if (isRobotChar) {
    if (!isRobotDecorativeHat(clothingItem)) {
      return { allowed: false, reason: 'equip.error.robotCannotWearClothing' };
    }
    return { allowed: true, reason: null };
  }

  return { allowed: true, reason: null };
}

/**
 * Power armor equip check — explicit block for robots/mutants.
 * Even if canEquipArmor would block, this is a dedicated check for PA flow.
 */
export function canEquipPowerArmor(powerArmorItem, character) {
  const policy = getArmorPolicy(character);
  if (policy === ARMOR_POLICIES.ROBOT_ONLY) {
    return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
  }
  if (policy === ARMOR_POLICIES.RAIDER_ONLY) {
    return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
  }
  // Humans: allowed (further checks like frame/piece handled elsewhere)
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
