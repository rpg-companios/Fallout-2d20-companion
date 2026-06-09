// src/store/selectors.js
// Pure selector functions for reading data from the normalized character store

import { effectsDictToLegacyArray } from './effectsSync.js';

const PARAM_FIELDS = [
  'damage', 'fireRate', 'physicalDamageRating', 'energyDamageRating', 'radiationDamageRating',
];

export const createEmptyEquippedArmor = () => ({
  head: { armor: null, clothing: null },
  body: { armor: null, clothing: null },
  leftArm: { armor: null, clothing: null },
  rightArm: { armor: null, clothing: null },
  leftLeg: { armor: null, clothing: null },
  rightLeg: { armor: null, clothing: null },
});

/**
 * Flatten normalized parameter objects to display values
 */
export const flattenItemParams = (item) => {
  if (!item) return item;
  const flat = { ...item };
  PARAM_FIELDS.forEach((field) => {
    if (flat[field] && typeof flat[field] === 'object') {
      flat[field] = flat[field].total ?? flat[field].base;
    }
  });
  return flat;
};

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

/**
 * Build equippedArmor slot map from normalized store items
 */
export const getEquippedArmor = (state) => {
  const result = createEmptyEquippedArmor();
  const equippedItems = selectItemsByEquipped(state, true);
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

/**
 * Build store patch from weapon modification modal result
 */
export const weaponModPatchToStore = (modifiedWeapon) => {
  const rangeName = modifiedWeapon.range_name ?? modifiedWeapon.rangeName;
  const damageEffects = modifiedWeapon.damage_effects ?? modifiedWeapon.damageEffects;
  const damageType = modifiedWeapon.damage_type ?? modifiedWeapon.damageType;

  return {
    ...modifiedWeapon,
    name: modifiedWeapon.name,
    baseWeaponName: modifiedWeapon.baseWeaponName,
    damage: modifiedWeapon.damage,
    fireRate: modifiedWeapon.fire_rate ?? modifiedWeapon.fireRate,
    rangeName,
    range_name: rangeName,
    damageEffects,
    damage_effects: damageEffects,
    damageType,
    damage_type: damageType,
    qualities: modifiedWeapon.qualities,
    weight: modifiedWeapon.weight,
    cost: modifiedWeapon.cost,
    ammoId: modifiedWeapon.ammoId ?? modifiedWeapon.ammo_id,
    appliedMods: modifiedWeapon.appliedMods,
  };
};

/**
 * Convert a normalized store weapon item to legacy display shape
 */
export const storeItemToWeaponDisplay = (item) => {
  const flat = flattenItemParams(item);
  const rangeName = flat.range_name ?? flat.rangeName
    ?? (typeof flat.range === 'string' ? flat.range : undefined);

  return {
    ...flat,
    id: flat.weaponId || flat.id,
    fire_rate: flat.fireRate ?? flat.fire_rate,
    damage_type: flat.damageType ?? flat.damage_type,
    damage_effects: flat.damageEffects ?? flat.damage_effects,
    range_name: rangeName,
    rangeName,
    weapon_type: flat.weaponType ?? flat.weapon_type,
    ammoId: flat.ammoId ?? flat.ammo_id,
  };
};

/**
 * Filter items by equipped status
 * @param {object} state - Character store state
 * @param {boolean} equipped - true for equipped items, false for inventory
 */
export const selectItemsByEquipped = (state, equipped) => {
  return Object.values(state.items || {}).filter(
    (item) => Boolean(item.equipped) === equipped,
  );
};

/**
 * Filter items by itemType
 * @param {object} state - Character store state
 * @param {string} itemType - e.g. 'weapon', 'armor', 'chem'
 */
export const selectItemsByType = (state, itemType) => {
  return Object.values(state.items || {}).filter(
    (item) => item.itemType === itemType,
  );
};

/**
 * Get total value for an attribute (base + modifiers)
 * @param {object} state - Character store state
 * @param {string} attrId - e.g. 'STR', 'END'
 */
export const selectAttributeTotal = (state, attrId) => {
  return state.attributes?.[attrId]?.total ?? 0;
};

/**
 * Get total value for a skill (base + modifiers)
 * @param {object} state - Character store state
 * @param {string} skillId - Skill name/id
 */
export const selectSkillTotal = (state, skillId) => {
  return state.skills?.[skillId]?.total ?? 0;
};

/**
 * Get active timed effects as legacy array for domain/effects helpers
 */
export const selectActiveTimedEffects = (state) => {
  return effectsDictToLegacyArray(state.effects);
};
