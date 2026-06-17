// domain/equipEquip.js
// Pure functions for equip eligibility checks.
// No React, no UI dependencies. All reason strings are i18n keys.
//
// Armor policy and character archetype now live in domain/origins.js
// (characterType drives the default policy; origin.armorPolicy overrides).

import { getAttributeValue, getEquipmentCarryWeightModifier } from './characterCreation';
import { ARMOR_POLICIES, getArmorPolicy, isRobotCharacter } from './origins';

/** True if the armor item is robot-specific. */
const isRobotArmor = (armorItem) =>
  Boolean(armorItem?.robotOnly || armorItem?.robotArmorType);

/** True if the armor item is mutant/raider restricted. */
const isMutantArmor = (armorItem) => Boolean(armorItem?.mutantOnly);

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
 *  - robotOnly             -> only robot armor
 *  - raiderOnly            -> only mutant-tagged armor
 *  - standard              -> standard + power armor, but no robot/mutant armor
 */
export function canEquipArmor(armorItem, character) {
  const policy = getArmorPolicy(character);
  const robotArmor = isRobotArmor(armorItem);
  const mutantArmor = isMutantArmor(armorItem);

  if (policy === ARMOR_POLICIES.ROBOT_ONLY) {
    if (!robotArmor) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (policy === ARMOR_POLICIES.RAIDER_ONLY) {
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
 * Rules:
 *  - Robot-only weapon + non-robot policy character -> blocked.
 *  - Standard weapon  + robot-only policy character -> blocked.
 *  - Everything else                                -> allowed.
 */
export function canEquipWeapon(weaponItem, character) {
  const policy = getArmorPolicy(character);
  const isRobotChar = policy === ARMOR_POLICIES.ROBOT_ONLY;
  const isRobotWeapon = isRobotOnlyWeapon(weaponItem);

  if (isRobotWeapon && !isRobotChar) {
    return { allowed: false, reason: 'equip.error.robotOnlyWeapon' };
  }

  if (!isRobotWeapon && isRobotChar) {
    return { allowed: false, reason: 'equip.error.robotCannotUseStandardWeapon' };
  }

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
