import { debugLog } from '../src/debug/falloutDebug';
import { getWeaponById, getWeaponModById, getAmmoById, getItemByName } from '../db/Database';
import { resolveRandomLootByRoll } from '../components/screens/CharacterScreen/logic/RandomLootLogic';
import { evaluateRollConfig } from './diceRollsLogic';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getUniqQualityName } from './registry';
import { composeNameWithUniqQualities } from './uniqQuality';
import { tWeaponsAndArmorScreen } from '../components/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';

// Уникальные качества записи комплекта прикрепляются к предмету: поле
// uniqQualities уходит в стор, имена качеств добавляются к имени предмета
// («дерзкая» + «форменная одежда» = «дерзкая форменная одежда»).
const applyUniqQualityNames = (item) => {
  if (!item?.uniqQualities?.length) return item;
  const composed = composeNameWithUniqQualities(item.name, item.uniqQualities, getUniqQualityName);
  if (!composed || composed === item.name) return item;
  return { ...item, name: composed };
};

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
    id: ammoId,
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
      ...(catalog?.magazines || []),
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

  // Ложа (stock) превращает пистолет в винтовку: имя берём из данных оружия
  // (stockNames.with), если оно задано. Это правило книги (Any Stock mods
  // change the weapon to a rifle), обеспеченное ДАННЫМИ — движок лишь знает,
  // что мод из слота Stocks меняет базовое имя.
  const hasStock = mods.some((mod) => mod.slot === 'Stocks');
  // Префикс самой ложи (например, «Стандартная ложа») не пишем — он избыточен,
  // когда ложа уже меняет имя оружия на винтовку. Префиксы стволов/ёмкостей и
  // т.п. остаются.
  const prefixes = mods
    .filter((mod) => mod.slot !== 'Stocks')
    .map((mod) => mod.prefix)
    .filter(Boolean);
  const stockName = hasStock ? (weaponData.stockNames?.with) : null;
  const baseName = stockName || weaponData.name || item.weaponId;
  // Уникальные качества — перед именем: «дерзкая» + «Опасная бритва».
  const uniqNames = (item.uniqQualities || []).map(getUniqQualityName).filter(Boolean);
  const displayName = [...prefixes, ...uniqNames, baseName].join(' ');
  const resolvedAmmunition = await resolveAmmoObject(item.ammo, weaponData.ammoId);

  // appliedMods (slot → modId) строится здесь, чтобы любой путь доставки оружия
  // (finalItems модалки, robotInventory initRobotSlots) нёс моды в стор
  // одинаково — без потери модов при экипировке встроенного оружия.
  const appliedMods = {};
  for (const mod of mods) {
    if (mod.slot && mod.id) appliedMods[mod.slot] = mod.id;
  }

  // Вариант предмета (trueItemId, напр. «Опасная бритва» = выкидной нож):
  // для программы это истинный предмет — выдаём его id, а имя варианта
  // сохраняем как baseName (оригинальное имя для стека и имён с модами).
  const trueItemId = weaponData.trueItemId || null;
  const resolvedWeaponId = trueItemId || item.weaponId;

  return {
    ...item,
    weaponId: resolvedWeaponId,
    // baseName только у вариантов: у обычного оружия имя — из каталога.
    baseName: trueItemId ? baseName : undefined,
    _weapon: weaponData,
    builtinToHead: item.builtinToHead ?? weaponData.builtinToHead,
    builtinToArm: item.builtinToArm ?? weaponData.builtinToArm,
    _mods: mods,
    appliedMods,
    displayName,
    name: displayName,
    itemType: 'weapon',
    ammoId: weaponData.ammoId ?? item.ammoId ?? null,
    resolvedAmmunition,
    hasMods: weaponData.hasMods ?? false,
  };
}

export async function resolveNonWeaponItem(item) {
  if (item.itemType === 'ammo' && item.ammoId) {
    const resolved = await resolveAmmoObject({ ammoId: item.ammoId, quantity: item.quantity }, item.ammoId);
    if (resolved) return { ...resolved, type: item.type };
  }

  if (item.type === 'rollTable') {
    const roll = item.roll || {};
    const count = resolveTableRollCount(roll);
    // Способ броска берём из спеки: mode 'sum' — сумма `count` костей (для таблиц
    // с диапазоном >20); sides — из rollType (D20 → 20). По умолчанию separate.
    const mode = roll.mode === 'sum' ? 'sum' : 'separate';
    const sides = parseInt(String(roll.rollType || '').replace(/\D/g, ''), 10) || 20;
    const tableId = ROLL_TABLE_TAG[item.tableId] || item.tableId;
    // Авто-переброс (rerollUntil): бросаем, пока результат не удовлетворит
    // условию на поле предмета — { "isAlcohol": true } / { "isMeat": true }.
    // Побросковый переброс (separate): каждый бросок крутится отдельно, со
    // своим лимитом попыток (таблица может быть смещена к неподходящим
    // позициям — лимит защищает от бесконечного цикла; если подходящих нет
    // вообще — остаётся последний бросок как есть).
    const rerollUntil = item.rerollUntil;
    const matchesReroll = (entry) => Object.entries(rerollUntil || {})
      .every(([field, expected]) => entry?.[field] === expected);
    let resolvedItems = await resolveRandomLootByRoll(tableId, count, mode, sides);
    if (rerollUntil && Object.keys(rerollUntil).length && resolvedItems.length) {
      const rollSingle = () => resolveRandomLootByRoll(tableId, 1, 'separate', sides);
      if (mode === 'separate') {
        const rerolled = [];
        for (const entry of resolvedItems) {
          let item = entry;
          for (let attempt = 0; attempt < 50 && item && !matchesReroll(item); attempt += 1) {
            const again = await rollSingle();
            item = again?.[0] || item;
          }
          rerolled.push(item);
        }
        resolvedItems = rerolled;
      } else {
        // mode 'sum': одна суммарная кость — перебрасываем партию целиком.
        for (let attempt = 0; attempt < 50 && !resolvedItems.every(matchesReroll); attempt += 1) {
          const again = await resolveRandomLootByRoll(tableId, count, mode, sides);
          if (!again.length) break;
          resolvedItems = again;
        }
      }
    }
    // Preserve each rolled item's native itemType (chem/weapon/armor/clothing/misc)
    // so addNewItem stores them under the right inventory category. Previously
    // every roll result was tagged itemType: 'loot', which made inventory
    // categorization meaningless.
    if (resolvedItems.length > 1) {
      return { ...resolvedItems[0], _extraItems: resolvedItems.slice(1) };
    }
    if (resolvedItems.length === 1) {
      return { ...resolvedItems[0] };
    }
    // Empty roll (table miss) — keep 'loot' placeholder so it's visible in UI.
    return { ...item, name: `${count}d20<${tableId}>`, itemType: 'loot' };
  }

  const byId = resolveItemById(item);
  if (byId) return applyUniqQualityNames(byId);

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
  debugLog('kits.resolve.start', { kitId: kit?.id, count: kit?.items?.length });
  const entries = await Promise.all((kit.items || []).map(async (entry, index) => {
    try {
      const resolved = await resolveEntry(entry);
      const label = resolved?.displayName || resolved?.name || resolved?.itemId || resolved?.weaponId || JSON.stringify(resolved).slice(0, 60);
      debugLog('kits.resolve.entry', { index, type: entry?.type, itemType: entry?.itemType, label });
      return resolved;
    } catch (err) {
      debugLog('kits.resolve.failed', { index, type: entry?.type, itemType: entry?.itemType, error: err?.message || String(err) });
      throw err;
    }
  }));

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
