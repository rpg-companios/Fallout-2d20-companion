import { tInventory } from '../../../components/screens/InventoryScreen/logic/inventoryI18n.js';

const FALLOUT_ITEM_TYPE_PRESENTATION = Object.freeze({
  weapon: Object.freeze({ icon: '🔫', labelKey: 'weapon' }),
  armor: Object.freeze({ icon: '🛡️', labelKey: 'armor' }),
  clothing: Object.freeze({ icon: '👕', labelKey: 'clothing' }),
  outfit: Object.freeze({ icon: '👕', labelKey: 'clothing' }),
  ammo: Object.freeze({ icon: '🔹', labelKey: 'ammo' }),
  misc: Object.freeze({ icon: '🔧' }),
  chem: Object.freeze({ icon: '💊', labelKey: 'chem' }),
  chems: Object.freeze({ icon: '💊', labelKey: 'chem' }),
  drinks: Object.freeze({ icon: '🥤', labelKey: 'drinks' }),
  food: Object.freeze({ icon: '🍖' }),
  magazine: Object.freeze({ icon: '📖' }),
  powerArmor: Object.freeze({ icon: '⚡', labelKey: 'powerArmor' }),
  robotConsumable: Object.freeze({ icon: '💊' }),
  plating: Object.freeze({ icon: '🔩', labelKey: 'plating' }),
  junk: Object.freeze({ icon: '🗑️', labelKey: 'junk' }),
  robotArmor: Object.freeze({ icon: '🛡️', labelKey: 'robotArmor' }),
  robotFrame: Object.freeze({ icon: '⚙️', labelKey: 'robotFrame' }),
});

const FALLOUT_CATEGORY_ICONS = Object.freeze({
  weapon: '🔫',
  armor: '🛡️',
  powerArmor: '⚡',
  clothing: '👕',
  ammo: '🔹',
  food: '🍖',
  drinks: '🥤',
  chems: '💊',
  items: '🔧',
  materials: '🧰',
  junk: '🗑️',
  robotEquipment: '🤖',
  robotWeapons: '⚙️',
  robotPlating: '🔩',
  robotArmorLayer: '🛡️',
  robotFrame: '⚙️',
  robotBodyParts: '🦾',
  robotModules: '💡',
});

export const getFalloutItemTypeIcon = (itemType) => {
  const presentation = Object.hasOwn(FALLOUT_ITEM_TYPE_PRESENTATION, itemType)
    ? FALLOUT_ITEM_TYPE_PRESENTATION[itemType]
    : null;
  return presentation?.icon ?? null;
};

export const getFalloutItemTypeLabel = (itemType) => {
  const presentation = Object.hasOwn(FALLOUT_ITEM_TYPE_PRESENTATION, itemType)
    ? FALLOUT_ITEM_TYPE_PRESENTATION[itemType]
    : null;
  return presentation?.labelKey
    ? tInventory(`modals.addItemModal.itemTypes.${presentation.labelKey}`)
    : '';
};

export const getFalloutCategoryIcon = (categoryLabel) => {
  const categoryKey = Object.keys(FALLOUT_CATEGORY_ICONS).find((key) => (
    tInventory(`modals.addItemModal.categories.${key}`) === categoryLabel
  ));
  return categoryKey ? FALLOUT_CATEGORY_ICONS[categoryKey] : null;
};

export const getFalloutRandomLootCatalog = (catalog, itemType) => {
  if (itemType === 'chem' || itemType === 'chems') return catalog?.chems ?? null;
  return null;
};
