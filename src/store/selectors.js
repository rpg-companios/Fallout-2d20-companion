// src/store/selectors.js
// Pure selector functions for reading data from the normalized character store

import { debugLog } from '../debug/falloutDebug';
import { effectsDictToLegacyArray } from './effectsSync.js';
import { resolveWeaponRangeFields } from '../../domain/range.js';
import { createEmptyEquippedArmor } from '../../domain/equippedArmor.js';

const PARAM_FIELDS = [
  'damage', 'fireRate', 'physicalDamageRating', 'energyDamageRating', 'radiationDamageRating',
];

// Пустая карта слотов экипировки живёт в domain/equippedArmor.js (единый источник).

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
  return {
    appliedMods: modifiedWeapon?.appliedMods || {},
  };
};

/**
 * Convert a normalized store weapon item to legacy display shape
 */
export const storeItemToWeaponDisplay = (item) => {
  const flat = flattenItemParams(item);
  // Resolve the ordinal range scale (catalog letter 'C'/'M'/'L'/'E' → canonical
  // name/index) so display + mod-step math share one representation. See domain/range.js.
  const { range_index, range_name } = resolveWeaponRangeFields(flat);

  // Десериализуем damage_type если это JSON-строка
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

/**
 * Filter items by equipped status
 * @param {object} state - Character store state
 * @param {boolean} equipped - true for equipped items, false for inventory
 */
export const selectItemsByEquipped = (state, equipped) => {
  const matched = Object.values(state.items || {}).filter(
    (item) => Boolean(item.equipped) === equipped,
  );
  debugLog('items.selectByEquipped', {
    total: Object.keys(state.items || {}).length,
    equipped,
    matched: matched.length,
  });
  return matched;
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
