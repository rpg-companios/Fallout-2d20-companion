import { formatInventoryText, tInventory } from '../../../components/screens/InventoryScreen/logic/inventoryI18n.js';

const FALLOUT_WEAPON_TYPE_GROUPS = Object.freeze([
  Object.freeze({ key: 'light', dbValue: 'Light' }),
  Object.freeze({ key: 'heavy', dbValue: 'Heavy' }),
  Object.freeze({ key: 'energy', dbValue: 'Energy' }),
  Object.freeze({ key: 'melee', dbValue: 'Melee' }),
  Object.freeze({ key: 'unarmed', dbValue: 'Unarmed' }),
  Object.freeze({ key: 'thrown', dbValue: 'Thrown' }),
  Object.freeze({ key: 'explosive', dbValue: 'Explosive' }),
]);

const categoryLabel = (key) => tInventory(`modals.addItemModal.categories.${key}`);
const categoryItemsLabel = () => categoryLabel('all');

const groupByCatalogType = (groups = []) => groups.reduce((result, group) => {
  result[group.type] = group.items;
  return result;
}, {});

export const getFalloutWeaponTypeGroups = () => FALLOUT_WEAPON_TYPE_GROUPS.map(({ key, dbValue }) => ({
  key,
  dbValue,
  label: tInventory(`modals.addItemModal.weaponTypeLabels.${key}`),
}));

export const buildFalloutAddItemCatalogTree = ({ catalog = {}, weaponsByType = {} } = {}) => ({
  [categoryLabel('weapon')]: weaponsByType,
  [categoryLabel('armor')]: groupByCatalogType(catalog.armor?.armor || []),
  [categoryLabel('powerArmor')]: groupByCatalogType(catalog.powerArmor?.powerArmor || []),
  [categoryLabel('clothing')]: groupByCatalogType(catalog.clothes?.clothes || []),
  [categoryLabel('ammo')]: {
    [categoryItemsLabel()]: Array.isArray(catalog.ammoTypes) ? catalog.ammoTypes : [],
  },
  [categoryLabel('drinks')]: {
    [categoryItemsLabel()]: catalog.drinks || [],
  },
  [categoryLabel('chems')]: {
    [categoryItemsLabel()]: catalog.chems || [],
  },
  [categoryLabel('food')]: {
    [categoryItemsLabel()]: catalog.food || [],
  },
  [categoryLabel('magazines')]: {
    [categoryItemsLabel()]: catalog.magazines || [],
  },
  [categoryLabel('items')]: {
    [categoryItemsLabel()]: catalog.generalGoods || [],
  },
  [categoryLabel('materials')]: {
    [categoryItemsLabel()]: catalog.materials || [],
  },
  [categoryLabel('junk')]: {
    [categoryItemsLabel()]: catalog.junk || [],
  },
  [categoryLabel('robotEquipment')]: {
    [categoryLabel('robotWeapons')]: catalog.robotWeaponsOnly || [],
    [categoryLabel('robotPlating')]: catalog.robotPlating || [],
    [categoryLabel('robotArmorLayer')]: catalog.robotArmorLayer || [],
    [categoryLabel('robotFrame')]: catalog.robotFrames || [],
    [categoryLabel('robotBodyParts')]: catalog.robotBody || [],
    [categoryLabel('robotModules')]: catalog.robotModules || [],
    [categoryLabel('robotMisc')]: catalog.robotItems || [],
  },
});

export const getFalloutEquipmentFilterLabels = (catalog = {}) => ({
  kinds: {
    weapon: categoryLabel('weapon'),
    armor: categoryLabel('armor'),
    powerArmor: categoryLabel('powerArmor'),
    clothing: categoryLabel('clothing'),
  },
  ammoNames: (catalog.ammoTypes || []).map((row) => ({ id: row.id, name: row.name })),
  damageTypes: tInventory('modals.addItemModal.filter.damageTypes'),
  weaponTypes: tInventory('modals.addItemModal.filter.weaponTypes'),
  distances: tInventory('modals.addItemModal.filter.distances'),
  bodyParts: tInventory('modals.addItemModal.filter.bodyPartsDict'),
});

export const getFalloutGearCategoryLabels = () => (
  ['weapon', 'armor', 'powerArmor', 'clothing'].map(categoryLabel)
);

export const getFalloutAllCategoryLabel = categoryItemsLabel;

export const formatFalloutFilterResultsFound = (count) => formatInventoryText(
  tInventory('modals.addItemModal.filter.resultsFound'),
  { n: count },
);

/** Preserve the shared modal's existing search/filter category selection. */
export const getFalloutSearchableItems = ({ catalogTree = {}, filterActive = false } = {}) => {
  const items = [];
  const gearCategoryKeys = ['weapon', 'armor', 'powerArmor', 'clothing'];
  const groupedCategoryKeys = filterActive
    ? gearCategoryKeys
    : [...gearCategoryKeys, 'robotEquipment'];

  groupedCategoryKeys.forEach((key) => {
    const group = catalogTree[categoryLabel(key)] || {};
    Object.values(group).forEach((entries) => {
      if (Array.isArray(entries)) items.push(...entries);
    });
  });

  if (!filterActive) {
    const flatCategoryKeys = ['ammo', 'chems', 'drinks', 'food', 'items', 'materials', 'junk'];
    const allLabel = categoryItemsLabel();
    flatCategoryKeys.forEach((key) => {
      const entries = catalogTree[categoryLabel(key)]?.[allLabel];
      if (Array.isArray(entries)) items.push(...entries);
    });
  }

  return items;
};
