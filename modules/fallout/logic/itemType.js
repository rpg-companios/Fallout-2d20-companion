export const FALLOUT_CATALOG_ITEM_TYPE_CANDIDATES = Object.freeze([
  'weapon',
  'ammo',
  'armor',
  'armorMod',
  'weaponMod',
  'clothing',
  'outfit',
  'misc',
  'chem',
  'drinks',
  'food',
  'junk',
  'magazine',
  'powerArmor',
  'robotPart',
]);

// Generic semantic roles are mapped to Fallout-owned catalog item-type IDs.
export const FALLOUT_ITEM_TYPE_IDS = Object.freeze({
  weapon: 'weapon',
  ammo: 'ammo',
  armor: 'armor',
  clothing: 'clothing',
  outfit: 'outfit',
  misc: 'misc',
  powerArmor: 'powerArmor',
  robotArm: 'robotArm',
  robotPart: 'robotPart',
});

/** Interpret Fallout legacy payload fields as catalog item types. */
export const inferFalloutItemTypeFromItem = (item) => {
  if (item?.effectType || item?.durationInScenes || item?.duration || item?.positiveEffect) return 'chem';
  if (item?.type === 'ammo') return 'ammo';
  if (item?.weaponId || item?.damage !== undefined) return 'weapon';
  if (item?.clothingType) return 'clothing';
  if (item?.protectedAreas) return 'armor';
  return null;
};

export const classifyFalloutItem = (item) => {
  const itemType = item?.itemType || inferFalloutItemTypeFromItem(item);
  const isWeapon = itemType === FALLOUT_ITEM_TYPE_IDS.weapon;
  const isArmor = itemType === FALLOUT_ITEM_TYPE_IDS.armor;
  const isClothing = itemType === FALLOUT_ITEM_TYPE_IDS.clothing
    || itemType === FALLOUT_ITEM_TYPE_IDS.outfit;
  const isPowerArmor = itemType === FALLOUT_ITEM_TYPE_IDS.powerArmor;
  return {
    weapon: isWeapon,
    armor: isArmor,
    clothing: isClothing,
    powerArmor: isPowerArmor,
    ammo: itemType === FALLOUT_ITEM_TYPE_IDS.ammo,
    consumable: ['chem', 'chems', 'drinks', 'food'].includes(itemType),
    equippable: isWeapon || isArmor || isClothing || isPowerArmor,
  };
};

/** Fallout catalog item types rendered with protection ratings in item summaries. */
export const isFalloutArmorLikeItem = (item) =>
  item?.itemType === 'plating'
  || item?.itemType === 'robotArmor'
  || item?.itemType === 'powerArmor';

/** Resolve Fallout's explicit armor/clothing/powered-armor classification. */
export const getFalloutProtectionKind = (item) => {
  const itemType = String(item?.itemType || '').trim();
  if (itemType === 'powerArmor') return 'powerArmor';
  if (itemType === 'clothing' || itemType === 'outfit' || item?.clothingType) return 'clothing';
  if (itemType === 'armor' || item?.armorCategoryKey) return 'armor';
  return null;
};

export const isFalloutAmmoItem = (item) => (
  item?.itemType === FALLOUT_ITEM_TYPE_IDS.ammo || item?.type === FALLOUT_ITEM_TYPE_IDS.ammo
);

export const getFalloutArmorCategoryKey = (item, catalog) => {
  const key = item?.armorCategoryKey;
  return key && catalog?.armorRaw && Object.prototype.hasOwnProperty.call(catalog.armorRaw, key)
    ? key
    : null;
};

/** Infer Fallout's catalog type from a legacy-compatible item ID prefix. */
export const inferFalloutItemTypeFromId = (itemId) => {
  const id = String(itemId);
  return id.startsWith('weapon_') ? 'weapon'
    : id.startsWith('ammo_') ? 'ammo'
    : id.startsWith('armor_') ? 'armor'
    : id.startsWith('clothing_') || id.startsWith('headwear_') ? 'clothing'
    : id.startsWith('chem_') ? 'chem'
    : id.startsWith('drink_') ? 'drinks'
    : id.startsWith('food_') ? 'food'
    : id.startsWith('mag_') || id.startsWith('magazine_') ? 'magazine'
    : id.startsWith('robot_') ? 'robotPart'
    : id.startsWith('uniq_') || id.startsWith('mod_std_') ? 'armorMod'
    : id.startsWith('mod_') ? 'weaponMod'
    : id.startsWith('pa_') || id.startsWith('power_') ? 'powerArmor'
    : null;
};
