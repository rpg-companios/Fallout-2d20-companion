// Fallout-owned instance payload fields preserved when projecting catalog items.

// Exact setting-owned payload keys retained by the historical item-save projection.
export const FALLOUT_ITEM_SAVE_STATE_FIELDS = Object.freeze([
  'weaponId',
  'code',
  'Name',
  'charges',
  'hpCurrent',
  'requiresMkII',
  'installedOn',
  'appliedMods',
  'appliedArmorModId',
  'appliedUniqueArmorModId',
  'appliedClothingModId',
  'durabilityTracked',
  'durability',
  'durabilityAmmoRemainder',
  'durabilityWearRemainder',
  'sourceSlot',
  'isBuiltin',
  'isManipulator',
  'isEquipped',
  'installedWeapons',
  'builtinWeapons',
  'builtinWeaponId',
  'attackId',
  'itemCategory',
]);

export const FALLOUT_ITEM_INSTANCE_FIELDS = Object.freeze([
  'weaponId',
  'code',
  'Name',
  'baseName',
  'uniqQualities',
  'range',
  'damageType',
  'ammoId',
  'qualities',
  'installedOn',
  'appliedMods',
  'appliedArmorModId',
  'appliedUniqueArmorModId',
  'appliedClothingModId',
  'durabilityTracked',
  'durability',
  'durabilityAmmoRemainder',
  'durabilityWearRemainder',
  'charges',
  'maxCharges',
  'hpCurrent',
  'set',
  'installedPieces',
  'installedCore',
  'requiresMkII',
  'protectedAreas',
  'equippedSlots',
  'equipInstanceId',
  'imageName',
  'sourceSlot',
  'isBuiltin',
  'isManipulator',
  'isEquipped',
  'installedWeapons',
  'builtinWeapons',
  'builtinWeaponId',
  'attackId',
  'itemCategory',
]);

export const getFalloutCatalogItemId = (instance) =>
  instance?.weaponId || instance?.catalogId || instance?.id || null;

export const getFalloutItemCatalogId = (item) =>
  item?.id || item?.weaponId || item?.itemId || item?.armorId || item?.clothingId || item?.code || '';

export const resolveFalloutCatalogIdForNewItem = (item) => (
  item?.weaponId
  || item?.id
  || item?.code
  || item?.itemId
  || item?.armorId
  || item?.clothingId
  || null
);

export const createFalloutItemIdentityFields = (_item, { catalogItemId } = {}) => ({
  weaponId: catalogItemId,
});

export const getFalloutStoredItemName = (item, { catalogItemId } = {}) => (
  item?.name || item?.weaponName || item?.Name || catalogItemId || ''
);
