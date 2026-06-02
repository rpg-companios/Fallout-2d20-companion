// domain/equipEquip.js
// Pure functions for equip eligibility checks.
// No React, no UI dependencies. All reason strings are i18n keys.

import { getAttributeValue, getEquipmentCarryWeightModifier } from './characterCreation';

const ARMOR_POLICY = {
  HUMANOID_FULL: 'humanoid_full',
  SUPERMUTANT_RAIDER_ONLY: 'supermutant_raider_only',
  ROBOT_ONLY: 'robot_only',
};

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

function getArmorPolicy(character) {
  return character?.origin?.armorPolicy || ARMOR_POLICY.HUMANOID_FULL;
}

/**
 * Check whether a character can equip a given armor item.
 *
 * Policies:
 *  - robot_only                -> only robot armor
 *  - supermutant_raider_only   -> only mutant-tagged armor
 *  - humanoid_full             -> standard + power armor, but no robot/mutant armor
 */
export function canEquipArmor(armorItem, character) {
  const policy = getArmorPolicy(character);
  const robotArmor = isRobotArmor(armorItem);
  const mutantArmor = isMutantArmor(armorItem);

  if (policy === ARMOR_POLICY.ROBOT_ONLY) {
    if (!robotArmor) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  if (policy === ARMOR_POLICY.SUPERMUTANT_RAIDER_ONLY) {
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
  const isRobotCharacter = policy === ARMOR_POLICY.ROBOT_ONLY;
  const isRobotWeapon = isRobotOnlyWeapon(weaponItem);

  if (isRobotWeapon && !isRobotCharacter) {
    return { allowed: false, reason: 'equip.error.robotOnlyWeapon' };
  }

  if (!isRobotWeapon && isRobotCharacter) {
    return { allowed: false, reason: 'equip.error.robotCannotUseStandardWeapon' };
  }

  return { allowed: true, reason: null };
}

export function canEquipClothing(clothingItem, character) {
  const policy = getArmorPolicy(character);
  const isRobotChar = policy === ARMOR_POLICY.ROBOT_ONLY;

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
  const { origin, trait, attributes } = character || {};

  if (origin?.isRobot || trait?.modifiers?.isRobot) {
    return (trait?.modifiers?.carryWeightFixed ?? 150) + getEquipmentCarryWeightModifier(character);
  }

  const str = getAttributeValue(attributes || [], 'STR');
  const multiplier = trait?.modifiers?.carryWeightStrengthMultiplier ?? 10;
  return 150 + str * multiplier + getEquipmentCarryWeightModifier(character);
}
