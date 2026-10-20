// Fallout-owned item type interpretation and derived-item enrichment.
import { getFalloutUniqQualityName as getUniqQualityName } from './uniqQualities.js';
import { inferFalloutItemTypeFromItem } from './itemType.js';
import { enrichFalloutWeaponItem } from './weaponModifiers.js';
import { resolveFalloutModifiedItem as resolveFalloutArmorModifiedItem } from './armorMods.js';

export const resolveFalloutItem = (item, catalog) => {
  if (!item || typeof item !== 'object') return null;
  const itemType = item.itemType || inferFalloutItemTypeFromItem(item);

  if (itemType === 'weapon') {
    return enrichFalloutWeaponItem(item, catalog, { qualityNameById: getUniqQualityName });
  }
  return resolveFalloutArmorModifiedItem({ ...item, itemType }, catalog);
};

export const enrichFalloutWeaponItemWithNames = (item, catalog, options = {}) =>
  enrichFalloutWeaponItem(item, catalog, {
    ...options,
    qualityNameById: options.qualityNameById || getUniqQualityName,
  });
