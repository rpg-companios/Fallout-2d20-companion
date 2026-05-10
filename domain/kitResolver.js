import { getWeaponById, getWeaponModById, getAmmoById, getItemByName } from '../db/Database';
import { resolveRandomLootByRoll } from '../components/screens/CharacterScreen/logic/RandomLootLogic';
import { evaluateRollConfig } from './diceRollsLogic';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { tWeaponsAndArmorScreen } from '../components/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';

const CURRENCY_ITEM_TYPES = {
  currency: () => tWeaponsAndArmorScreen('kitResolver.currency'),
  currency_ncr: () => tWeaponsAndArmorScreen('kitResolver.currencyNcr'),
};

const ROLL_TABLE_TAG = {
  food: 'food',
  trinklet: 'trinklet',
  brewery: 'brewery',
  chem: 'chem',
  outcast: 'outcast',
  oddity: 'oddity',
};

const MR_HANDY_BODY_ID = 'robot_body_mister_handy';
const PROTECTRON_BODY_ID = 'robot_body_protectron';

const toNumber = (value) => Number.isFinite(value) ? value : Number(value) || 0;

const safeDbCall = async (fn, ...args) => {
  try {
    return await fn(...args);
  } catch {
    return null;
  }
};

const flattenGroupedItems = (source) => {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== 'object') return [];
  return Object.values(source).flatMap((entry) => {
    if (Array.isArray(entry)) {
      return entry.flatMap((group) => (Array.isArray(group?.items) ? group.items : []));
    }
    if (Array.isArray(entry?.items)) return entry.items;
    return [];
  });
};

const resolveRollQuantity = (quantity = {}) => {
  const base = toNumber(quantity.base);
  if (quantity.rollType === 'rollCD' && quantity.rollValue) {
    const op = quantity.op === '-' ? '-' : '+';
    return evaluateRollConfig({ base, rollType: 'rollCD', rollValue: toNumber(quantity.rollValue), op });
  }
  return base;
};

const resolveTableRollCount = (roll = {}) => {
  if (roll.rollType === 'D20' && roll.count) {
    return toNumber(roll.count);
  }
  return 1;
};

const resolveAmmoObject = async (ammoSpec, weaponAmmoId) => {
  if (!ammoSpec?.quantity) return null;
  const ammoId = ammoSpec.ammoId || weaponAmmoId;
  if (!ammoId) return null;

  const ammo = await safeDbCall(getAmmoById, ammoId);
  const catalog = getEquipmentCatalog();
  const fallbackAmmo = (catalog?.ammoTypes || []).find((entry) => entry.id === ammoId);
  const ammoData = ammo || fallbackAmmo;
  if (!ammoData) return null;

  const normalizedAmmoName = fallbackAmmo?.name || ammoData.name;
  const quantity = resolveRollQuantity(ammoSpec.quantity);
  return {
    name: normalizedAmmoName,
    quantity,
    type: 'ammo',
    itemType: 'ammo',
    cost: ammoData.cost,
    rarity: ammoData.rarity,
  };
};

const resolveItemById = (item) => {
  const catalog = getEquipmentCatalog();

  if (item.armorId) {
    const found = catalog?.armorIndex?.byId?.get(item.armorId);
    if (found) {
      return {
        ...found,
        ...item,
        name: found.name,
        itemType: found.itemType || 'armor',
      };
    }
  }

  if (item.clothingId) {
    const allClothes = (catalog?.clothes?.clothes || []).flatMap((group) => group.items || []);
    const found = allClothes.find((entry) => entry.id === item.clothingId);
    if (found) {
      return {
        ...found,
        ...item,
        name: found.name,
        itemType: 'clothing',
      };
    }
  }

  if (item.itemId) {
    const all = [
      ...flattenGroupedItems(catalog?.miscellaneous),
      ...(catalog?.generalGoods || []),
      ...(catalog?.oddities || []),
      ...(catalog?.chems || []),
      ...(catalog?.drinks || []),
      ...(catalog?.food || []),
      ...(catalog?.robotModules || []),
      ...(catalog?.robotArms || []),
      ...(catalog?.robotItems || []),
      ...(catalog?.robotBody || []),
      ...(catalog?.robotHeads || []),
      ...(catalog?.robotLegs || []),
    ];
    const found = all.find((entry) => entry.id === item.itemId);
    if (found) {
      return {
        ...found,
        ...item,
        name: found.name,
        itemType: item.itemType || found.itemType || 'misc',
      };
    }
  }

  return null;
};

export async function resolveWeaponItem(item) {
  const weapon = await safeDbCall(getWeaponById, item.weaponId);
  const catalog = getEquipmentCatalog();
  const fallbackWeapon = (catalog?.weapons || []).find((entry) => entry.id === item.weaponId);
  const weaponData = weapon || fallbackWeapon;
  if (!weaponData) {
    return {
      ...item,
      name: item.weaponId,
      itemType: 'weapon',
      _weapon: null,
      _mods: [],
      resolvedAmmunition: null,
      hasMods: false,
    };
  }

  const mods = [];
  for (const modId of (item.modIds || [])) {
    const mod = await safeDbCall(getWeaponModById, modId);
    if (mod) mods.push(mod);
  }

  const prefixes = mods.map((mod) => mod.prefix).filter(Boolean);
  const weaponName = weaponData.name || item.weaponId;
  const displayName = [...prefixes, weaponName].join(' ');
  const resolvedAmmunition = await resolveAmmoObject(item.ammo, weaponData.ammo_id || weaponData.Ammo);

  return {
    ...item,
    _weapon: weaponData,
    _mods: mods,
    displayName,
    name: displayName,
    itemType: 'weapon',
    resolvedAmmunition,
    hasMods: weaponData.hasMods ?? false,
  };
}

export async function resolveNonWeaponItem(item) {
  if (item.type === 'rollTable') {
    const count = resolveTableRollCount(item.roll);
    const tableId = ROLL_TABLE_TAG[item.tableId] || item.tableId;
    const resolvedItems = await resolveRandomLootByRoll(tableId, count);
    if (resolvedItems.length > 1) {
      return { ...resolvedItems[0], _extraItems: resolvedItems.slice(1), itemType: 'loot' };
    }
    if (resolvedItems.length === 1) {
      return { ...resolvedItems[0], itemType: 'loot' };
    }
    return { ...item, name: `${count}d20<${tableId}>`, itemType: 'loot' };
  }

  const byId = resolveItemById(item);
  if (byId) return byId;

  if (CURRENCY_ITEM_TYPES[item.itemType]) {
    const name = CURRENCY_ITEM_TYPES[item.itemType]();
    return {
      ...item,
      name,
      quantity: toNumber(item.quantity || 0),
    };
  }

  if (item.name) {
    const dbItem = await safeDbCall(getItemByName, item.name);
    if (dbItem) {
      return {
        ...item,
        ...dbItem,
        name: dbItem.name,
        itemType: dbItem.item_type || item.itemType,
      };
    }
  }

  const unknownName = tWeaponsAndArmorScreen('kitResolver.unknownItem');
  return { ...item, name: item.name || item.itemId || unknownName };
}

async function resolveEntry(entry) {
  if (entry.type === 'choice') {
    const options = await Promise.all((entry.items || []).map(async (option) => {
      if (option.group) {
        const group = await Promise.all(option.group.map((groupItem) => (
          groupItem.weaponId ? resolveWeaponItem(groupItem) : resolveNonWeaponItem(groupItem)
        )));
        return { ...option, group };
      }
      return option.weaponId ? resolveWeaponItem(option) : resolveNonWeaponItem(option);
    }));
    return { ...entry, items: options };
  }

  return entry.weaponId ? resolveWeaponItem(entry) : resolveNonWeaponItem(entry);
}

export async function resolveKitItems(kit) {
  const entries = await Promise.all((kit.items || []).map(resolveEntry));

  const flatEntries = [];
  for (const entry of entries) {
    if (entry?._extraItems) {
      const { _extraItems, ...main } = entry;
      flatEntries.push(main, ..._extraItems);
    } else {
      flatEntries.push(entry);
    }
  }

  const withAutoRobotBody = [...flatEntries];
  const isMisterHandyKit = String(kit?.id || '').startsWith('mister_handy_');
  const isProtectronKit = String(kit?.id || '').startsWith('protectron_');
  const hasMisterHandyBody = withAutoRobotBody.some(
    (entry) => entry?.id === MR_HANDY_BODY_ID || entry?.itemId === MR_HANDY_BODY_ID,
  );
  const hasProtectronBody = withAutoRobotBody.some(
    (entry) => entry?.id === PROTECTRON_BODY_ID || entry?.itemId === PROTECTRON_BODY_ID,
  );

  if (isMisterHandyKit && !hasMisterHandyBody) {
    const bodyPart = resolveItemById({
      type: 'fixed',
      itemId: MR_HANDY_BODY_ID,
      itemType: 'robotPart',
      hiddenInKitModal: true,
      quantity: 1,
      autoInjected: true,
    });
    if (bodyPart) {
      withAutoRobotBody.push(bodyPart);
    }
  }

  if (isProtectronKit && !hasProtectronBody) {
    const bodyPart = resolveItemById({
      type: 'fixed',
      itemId: PROTECTRON_BODY_ID,
      itemType: 'robotPart',
      hiddenInKitModal: true,
      quantity: 1,
      autoInjected: true,
    });
    if (bodyPart) {
      withAutoRobotBody.push(bodyPart);
    }
  }

  return {
    ...kit,
    items: withAutoRobotBody,
  };
}
