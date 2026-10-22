import { tInventory } from 'engine:components/screens/InventoryScreen/logic/inventoryI18n';
import { applyWeaponWear, isAmmoWeapon, rollWeaponDurability } from '../logic/weaponDurability.js';

/** Preserve the legacy repair flag only in its canonical boolean form. */
export const normalizeDurabilityItemState = (item) => {
  if (!item || typeof item !== 'object') return item;
  if (item.temporaryRepair === undefined || item.temporaryRepair === true) return item;
  const normalized = { ...item };
  delete normalized.temporaryRepair;
  return normalized;
};

/** Settings consumed only when this setting opts into the durability feature. */
export const selectDurabilitySettings = (state) => ({
  randomQualityEnabled: state.getSettingValue('randomWeaponQualityEnabled'),
  durabilityLossEnabled: state.getSettingValue('weaponDurabilityLossEnabled'),
});

const supportsTrackedDurability = (item) => (
  item?.itemType === 'armor'
  || (item?.itemType === 'weapon' && isAmmoWeapon(item))
);

/**
 * The package initializes durable item instances when acquired. Returning null
 * means this item/source is not handled by the feature, so the engine continues
 * with its normal stacking path.
 */
export const initializeDurabilityOnAcquisition = (item, {
  quantity = 1,
  source,
  randomQualityEnabled = false,
} = {}) => {
  if (!randomQualityEnabled || !supportsTrackedDurability(item)) return null;

  const quantityNumber = Number(quantity);
  const instanceCount = Number.isFinite(quantityNumber)
    ? Math.max(0, Math.trunc(quantityNumber))
    : 1;
  return Array.from({ length: instanceCount }, () => ({
    ...item,
    quantity: 1,
    durabilityTracked: true,
    durability: source === 'buy' ? 100 : rollWeaponDurability(),
    durabilityAmmoRemainder: 0,
    durabilityWearRemainder: 0,
  }));
};

/**
 * Fallout ammo-use policy passed to the engine's generic item-use transaction.
 * The engine never interprets durability fields or quality IDs.
 */
export const applyAmmoSpendDurability = (item, ammoAmount, {
  durabilityLossEnabled = false,
  baseLossPer10Shots = 1,
} = {}) => {
  if (!durabilityLossEnabled || !item) return { ok: true, item };
  const trackedItem = item.durabilityTracked
    ? item
    : {
      ...item,
      durabilityTracked: true,
      durability: 100,
      durabilityAmmoRemainder: 0,
      durabilityWearRemainder: 0,
    };
  if (Number(trackedItem.durability) <= 0) return { ok: false, reason: 'broken' };
  return {
    ok: true,
    item: {
      ...trackedItem,
      ...applyWeaponWear(trackedItem, ammoAmount, baseLossPer10Shots),
    },
  };
};

/** Generic row data for the optional durability detail in the inventory table. */
export const getDurabilityPresentation = (item, settings = {}) => {
  if (!supportsTrackedDurability(item)) return null;
  if (!settings.randomQualityEnabled && !settings.durabilityLossEnabled) return null;

  return {
    current: item.durabilityTracked ? Number(item.durability) : 100,
    maximum: 100,
    needsRepair: Boolean(item.durabilityTracked && Number(item.durability) < 100),
    statusNote: item.temporaryRepair === true ? tInventory('screen.repair.tempNote') : null,
  };
};
