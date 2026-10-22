// Fallout-specific projections from normalized store records to legacy screens.
import { createEmptyEquippedArmor } from 'engine:domain/equippedArmor';
import { flattenItemParams } from 'engine:src/store/selectors';
import { resolveWeaponRangeFields } from './weaponRange.js';

const getSlotsForProtectedAreas = (item) => {
  if (Array.isArray(item?.equippedSlots) && item.equippedSlots.length > 0) {
    return item.equippedSlots;
  }

  const areas = Array.isArray(item?.protectedAreas) ? item.protectedAreas : [];
  const slots = [];
  if (areas.includes('Head')) slots.push('head');
  if (areas.includes('Body')) slots.push('body');
  if (areas.includes('Hand')) slots.push('leftArm', 'rightArm');
  if (areas.includes('Leg')) slots.push('leftLeg', 'rightLeg');
  return slots;
};

/** Build the Fallout equipped-armor projection from normalized store items. */
export const getFalloutEquippedArmor = (state) => {
  const result = createEmptyEquippedArmor();
  const equippedItems = Object.values(state?.items || {}).filter((item) => Boolean(item.equipped));
  const armorItemTypes = new Set(['armor', 'clothing', 'outfit']);

  const instances = new Map();
  equippedItems
    .filter((item) => armorItemTypes.has(item.itemType))
    .forEach((item) => {
      const flat = flattenItemParams(item);
      const instanceKey = flat.equipInstanceId || flat.stackKey || flat.id;
      if (!instances.has(instanceKey)) {
        instances.set(instanceKey, {
          item: flat,
          slots: getSlotsForProtectedAreas(flat),
        });
      }
    });

  instances.forEach(({ item, slots }) => {
    slots.forEach((slotKey) => {
      if (!result[slotKey]) return;
      if (item.itemType === 'outfit') {
        result[slotKey].clothing = item;
        result[slotKey].armor = null;
      } else if (item.itemType === 'clothing') {
        result[slotKey].clothing = item;
      } else {
        result[slotKey].armor = item;
      }
    });
  });

  return result;
};

/** Translate a Fallout modification result into the persisted item patch. */
export const falloutWeaponModPatchToStore = (modifiedWeapon) => ({
  appliedMods: modifiedWeapon?.appliedMods || {},
});

/** Find a store record for a Fallout weapon display projection. */
export const resolveFalloutStoreItemIdFromItems = (items, weapon) => {
  if (!weapon || !items) return undefined;
  if (weapon.instanceId && items[weapon.instanceId]) return weapon.instanceId;
  if (weapon.uniqueId && items[weapon.uniqueId]) return weapon.uniqueId;
  if (weapon.id && items[weapon.id]) return weapon.id;
  return Object.values(items).find(
    (item) => item.equipped && (
      (weapon.uniqueId != null && item.uniqueId === weapon.uniqueId)
      || (weapon.instanceId != null && item.instanceId === weapon.instanceId)
      || (weapon.weaponId != null && item.weaponId === weapon.weaponId)
      || (weapon.id != null && item.id === weapon.id)
    ),
  )?.id;
};

/** Project a normalized Fallout weapon record into its legacy display shape. */
export const storeItemToFalloutWeaponDisplay = (item) => {
  const flat = flattenItemParams(item);
  const { range_index, range_name } = resolveWeaponRangeFields(flat);

  let damageType = flat.damageType;
  if (typeof damageType === 'string') {
    try {
      damageType = JSON.parse(damageType);
    } catch {
      damageType = [damageType];
    }
  }
  if (!Array.isArray(damageType)) {
    damageType = damageType ? [damageType] : ['physical'];
  }

  return {
    ...flat,
    instanceId: flat.instanceId || flat.id,
    id: flat.weaponId || flat.id,
    fireRate: flat.fireRate,
    damageType,
    damageEffects: flat.damageEffects,
    rangeIndex: range_index,
    rangeName: range_name,
    weaponType: flat.weaponType,
    ammoId: flat.ammoId,
  };
};
