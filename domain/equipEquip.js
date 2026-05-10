// domain/equipEquip.js
// Pure functions for equip eligibility checks.
// No React, no UI dependencies. All reason strings are i18n keys.
//
// Design principle: access is OPEN by default.
// Restrictions are declared only on origins/traits that have them.
// Currently restricted:
//   - Robots  → can only wear robot armor
//   - Mutants → can only wear mutant-tagged armor (mutantOnly: true)
//     (currently raider armor from armor.json; a dedicated mutant armor file
//      may be added later — the flag will remain the same)

import { getAttributeValue } from './characterCreation';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True if the armor item is robot-specific. */
const isRobotArmor = (armorItem) =>
  Boolean(armorItem?.robotOnly || armorItem?.robotArmorType);

/** True if the armor item is mutant-specific. */
const isMutantArmor = (armorItem) => Boolean(armorItem?.mutantOnly);

/** True if the weapon comes from robot weapons catalog. */
const isRobotOnlyWeapon = (weaponItem) =>
  Boolean(
    weaponItem?.isRobotWeapon
    || String(weaponItem?.id || '').startsWith('robot_weapon_')
    || String(weaponItem?.id || '').startsWith('robot_arm_')
  );

// ---------------------------------------------------------------------------
// canEquipArmor
// ---------------------------------------------------------------------------

/**
 * Check whether a character can equip a given armor item.
 *
 * Rules:
 *  - Robot origin  → only robot armor. Everything else is blocked.
 *  - Mutant origin (isMutant: true on origin, or armorConstraint: 'mutantOnly' on trait)
 *                  → only mutant armor (mutantOnly: true). Everything else is blocked.
 *  - Everyone else → allowed by default; robot/mutant-tagged armor is blocked.
 *
 * @param {object} armorItem  - Armor item. Relevant flags: robotOnly, robotArmorType, mutantOnly.
 * @param {object} character  - { origin, trait }
 *   origin: { isRobot, isMutant }
 *   trait:  { modifiers: { armorConstraint } }
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipArmor(armorItem, character) {
  const { origin, trait } = character || {};

  const robotArmor = isRobotArmor(armorItem);
  const mutantArmor = isMutantArmor(armorItem);

  const isRobotCharacter = Boolean(origin?.isRobot);
  const isMutantCharacter =
    Boolean(origin?.isMutant) || trait?.modifiers?.armorConstraint === 'mutantOnly';

  // --- Robot character ---
  if (isRobotCharacter) {
    if (!robotArmor) {
      return { allowed: false, reason: 'equip.error.robotCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  // --- Mutant character ---
  if (isMutantCharacter) {
    if (!mutantArmor) {
      return { allowed: false, reason: 'equip.error.mutantCannotWearStandardArmor' };
    }
    return { allowed: true, reason: null };
  }

  // --- Everyone else: open by default, but robot/mutant gear is off-limits ---
  if (robotArmor) {
    return { allowed: false, reason: 'equip.error.cannotWearRobotArmor' };
  }
  if (mutantArmor) {
    return { allowed: false, reason: 'equip.error.cannotWearMutantArmor' };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// canEquipWeapon
// ---------------------------------------------------------------------------

/**
 * Check whether a character can equip a given weapon item.
 *
 * Rules:
 *  - Robot-only weapon + non-robot character → blocked.
 *  - Standard weapon  + robot character      → blocked (needs manipulator; caller handles that).
 *  - Everything else                         → allowed.
 *
 * @param {object} weaponItem - Weapon item. Relevant fields: id, limbSlot.
 * @param {object} character  - { origin }
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipWeapon(weaponItem, character) {
  const { origin } = character || {};
  const isRobotCharacter = Boolean(origin?.isRobot);
  const isRobotWeapon = isRobotOnlyWeapon(weaponItem);

  if (isRobotWeapon && !isRobotCharacter) {
    return { allowed: false, reason: 'equip.error.robotOnlyWeapon' };
  }

  if (!isRobotWeapon && isRobotCharacter) {
    return { allowed: false, reason: 'equip.error.robotCannotUseStandardWeapon' };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// canEquipClothing
// ---------------------------------------------------------------------------

/**
 * Check whether a character can equip a given clothing item.
 *
 * Rules:
 *  - Robot character → only clothing with canRobotWear: true is allowed.
 *  - Everyone else   → allowed by default.
 *
 * @param {object} clothingItem - Clothing item. Relevant flag: canRobotWear.
 * @param {object} character    - { origin }
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipClothing(clothingItem, character) {
  const { origin } = character || {};
  const isRobotChar = Boolean(origin?.isRobot);

  if (isRobotChar) {
    if (!clothingItem?.canRobotWear) {
      return { allowed: false, reason: 'equip.error.robotCannotWearClothing' };
    }
    return { allowed: true, reason: null };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// filterAvailableArmor
// ---------------------------------------------------------------------------

/**
 * Filter a list of armor items to only those the character can equip.
 *
 * @param {object[]} allArmor  - Array of armor items.
 * @param {object}   character - { origin, trait }.
 * @returns {object[]}
 */
export function filterAvailableArmor(allArmor, character) {
  if (!Array.isArray(allArmor)) return [];
  return allArmor.filter((item) => canEquipArmor(item, character).allowed);
}

// ---------------------------------------------------------------------------
// getCarryWeightLimit
// ---------------------------------------------------------------------------

/**
 * Calculate the carry weight limit for a character.
 *
 * Robots: fixed value from trait.modifiers.carryWeightFixed (default 150).
 * Everyone else: 150 + STR * multiplier
 *   (multiplier from trait.modifiers.carryWeightStrengthMultiplier, default 10).
 *
 * @param {object} character - { origin, trait, attributes }
 * @returns {number}
 */
export function getCarryWeightLimit(character) {
  const { origin, trait, attributes } = character || {};

  if (origin?.isRobot || trait?.modifiers?.isRobot) {
    return trait?.modifiers?.carryWeightFixed ?? 150;
  }

  const str = getAttributeValue(attributes || [], 'STR');
  const multiplier = trait?.modifiers?.carryWeightStrengthMultiplier ?? 10;
  return 150 + str * multiplier;
}
