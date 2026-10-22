// Fallout equip restrictions and denial-reason identifiers.
import { isItemAllowed, ACTIONS } from 'engine:domain/itemfitRules';
import { getFalloutProtectionKind } from './itemType.js';
import { isRobotCharacter } from './originTypes.js';

const denyReason = (character, robotReason, otherReason) =>
  isRobotCharacter(character) ? robotReason : otherReason;

export const resolveFalloutTargetLayer = (item) => {
  const kind = getFalloutProtectionKind(item);
  if (kind === 'armor') return 'armor';
  if (kind === 'clothing') return 'clothing';
  return null;
};

export const blocksFalloutArmorOver = (item) => {
  if (getFalloutProtectionKind(item) !== 'clothing') return false;
  return !(item?.allowsArmor === true || item?.clothingType === 'suit');
};

export const canEquipFalloutArmor = (item, character) => {
  if (isItemAllowed(item, ACTIONS.EQUIP, character)) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: denyReason(
      character,
      'equip.error.robotCannotWearStandardArmor',
      'equip.error.mutantCannotWearStandardArmor',
    ),
  };
};

export const canEquipFalloutWeapon = (item, character) => {
  if (isItemAllowed(item, ACTIONS.EQUIP, character)) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: denyReason(character, 'equip.error.robotCannotUseStandardWeapon', 'equip.error.robotOnlyWeapon'),
  };
};

export const canEquipFalloutClothing = (item, character) => {
  if (isItemAllowed(item, ACTIONS.EQUIP, character)) return { allowed: true, reason: null };
  return { allowed: false, reason: 'equip.error.robotCannotWearClothing' };
};
