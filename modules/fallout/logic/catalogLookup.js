import { getSettingData } from '../../../domain/registry.js';

const EMPTY_OBJECT = Object.freeze({});
const search = (items, id) => (items || []).find((entry) => entry && entry.id === id) || null;
const flattenMisc = (misc) => Array.isArray(misc)
  ? misc
  : (misc?.miscellaneous || []).flatMap((group) => group?.items || []);
const flattenClothes = (clothes) => (clothes?.clothes || []).flatMap((group) => group?.items || []);

export const getFalloutPowerArmorData = () =>
  getSettingData('equipment', 'powerArmor') ?? EMPTY_OBJECT;

/** Fallout catalog categories used when resolving legacy inventory references. */
export const FALLOUT_CATALOG_ITEM_TYPES = Object.freeze([
  'weapon', 'ammo', 'armor', 'armorMod', 'weaponMod', 'clothing', 'outfit', 'misc',
  'chem', 'chems', 'drinks', 'food', 'junk', 'magazine', 'powerArmor',
  'robotArm', 'robotBody', 'robotLeg', 'robotLegs', 'robotHead', 'robotPart', 'robotConsumable',
]);

export const findFalloutCatalogEntry = (catalog, id, itemType) => {
  if (!id || !catalog) return null;

  switch (itemType) {
    case 'weapon':
      return search(catalog.weapons, id);
    case 'ammo':
      return search(catalog.ammoTypes, id);
    case 'armor':
      return catalog.armorIndex?.byId?.get(id)
        || (Array.isArray(catalog.armor) ? search(catalog.armor, id) : null);
    case 'armorMod':
      return search(catalog.armorMods, id) || search(catalog.uniqArmorMods, id);
    case 'weaponMod':
      return search(catalog.weaponMods, id);
    case 'clothing':
    case 'outfit':
      return search(flattenClothes(catalog.clothes), id);
    case 'powerArmor':
      return search(catalog.powerArmorList, id);
    case 'robotArm':
      return search(catalog.robotArms, id);
    case 'robotBody':
      return search(catalog.robotBody, id);
    case 'robotLeg':
    case 'robotLegs':
      return search(catalog.robotLegs, id);
    case 'robotHead':
      return search(catalog.robotHeads, id);
    case 'robotPart':
      return search(catalog.robotArms, id)
        || search(catalog.robotBody, id)
        || search(catalog.robotLegs, id)
        || search(catalog.robotHeads, id)
        || search(catalog.robotPlating, id)
        || search(catalog.robotFrames, id);
    case 'robotConsumable':
      return search(catalog.generalGoods, id)
        || search(catalog.robotItems, id)
        || search(catalog.robotModules, id);
    case 'chem':
    case 'chems':
      return search(catalog.chems, id);
    case 'drinks':
      return search(catalog.drinks, id);
    case 'food':
      return search(catalog.food, id);
    case 'magazine':
      return search(catalog.magazines, id);
    case 'junk':
      return search(catalog.junk, id);
    case 'misc':
    default:
      return search(flattenMisc(catalog.miscellaneous), id)
        || search(catalog.generalGoods, id)
        || search(catalog.materials, id)
        || search(catalog.oddities, id)
        || search(catalog.junk, id)
        || search(catalog.robotModules, id)
        || search(catalog.robotItems, id);
  }
};
