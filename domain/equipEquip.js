// Generic equipment eligibility adapters. Setting-owned labels and policy
// special cases are delegated through the active inventory capability.
import { getCarryWeightLimit as getSettingCarryWeightLimit } from './characterCreation.js';
import { getSettingService } from './registry.js';
import { isItemAllowed, ACTIONS } from './itemfitRules.js';

const getInventoryService = () => getSettingService('inventory');
const getEligibility = () => getInventoryService()?.features?.equipmentEligibility ?? null;

const genericCheck = (item, character) => (
  isItemAllowed(item, ACTIONS.EQUIP, character)
    ? { allowed: true, reason: null }
    : { allowed: false, reason: null }
);

export const canEquipArmor = (item, character) => {
  const check = getEligibility()?.canEquipArmor;
  return typeof check === 'function' ? check(item, character) : genericCheck(item, character);
};

export const canEquipWeapon = (item, character) => {
  const check = getEligibility()?.canEquipWeapon;
  return typeof check === 'function' ? check(item, character) : genericCheck(item, character);
};

export const canEquipClothing = (item, character) => {
  const check = getEligibility()?.canEquipClothing;
  return typeof check === 'function' ? check(item, character) : genericCheck(item, character);
};

export const filterAvailableArmor = (items, character) => (
  Array.isArray(items) ? items.filter((item) => canEquipArmor(item, character).allowed) : []
);

/** Carry-weight formulas are setting-owned and exposed through character creation. */
export function getCarryWeightLimit(character) {
  return getSettingCarryWeightLimit(character);
}
