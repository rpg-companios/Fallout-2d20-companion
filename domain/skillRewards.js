// domain/skillRewards.js
// Резолвит награды за выбранные навыки из data/skillRewards.json.
// Механизм похож на kitResolver, но без UI — молча добавляет предметы в стор.

import rewardData from '../data/skillRewards.json';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { resolveRandomLootByRoll } from '../components/screens/CharacterScreen/logic/RandomLootLogic';
import { evaluateRollConfig } from './diceRollsLogic';
import { tWeaponsAndArmorScreen } from '../components/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';
import { debugLog } from '../src/debug/falloutDebug';

const toNumber = (v) => Number.isFinite(v) ? v : Number(v) || 0;

// Каталог по itemType для поиска предмета по id.
const findInCatalog = (catalog, id, itemType) => {
  const search = (arr) => (arr || []).find((e) => e.id === id);
  switch (itemType) {
    case 'weapon':
      return search(catalog?.weapons) || null;
    case 'ammo':
      return search(catalog?.ammoTypes) || null;
    case 'armor':
      return catalog?.armorIndex?.byId?.get(id) || null;
    case 'clothing':
    case 'outfit': {
      const all = (catalog?.clothes?.clothes || []).flatMap((g) => g.items || []);
      return search(all) || null;
    }
    case 'chem':
    case 'chems':
      return search(catalog?.chems) || null;
    case 'drinks':
      return search(catalog?.drinks) || null;
    case 'food':
      return search(catalog?.food) || null;
    case 'misc':
    default: {
      const misc = (catalog?.miscellaneous || []).flatMap((g) => g?.items || []);
      return search(misc) || search(catalog?.generalGoods) || null;
    }
  }
};

// Бросок кубика (боевой): base + rollValue * CD результат.
const rollCD = (base, rollValue) => {
  const result = evaluateRollConfig({
    rollType: 'rollCD',
    base: toNumber(base),
    rollValue: toNumber(rollValue),
    op: '+',
  });
  return Math.max(toNumber(base), toNumber(result));
};

// Бросок d20 для currency.
const rollD20Currency = () => {
  return Math.floor(Math.random() * 20) + 1;
};

/**
 * Резолвит одну запись награды в массив предметов для addNewItem.
 * @param {object} entry — запись из skillRewards.json
 * @param {object} catalog — getEquipmentCatalog()
 * @param {object} kitContext — { ammoFromKit?: string } (для SMALL_GUNS)
 * @returns {Promise<object[]>} — массив предметов
 */
const resolveEntry = async (entry, catalog, kitContext) => {
  // pickOne — выбор одного из вариантов (случайно).
  if (entry.pickOne) {
    const options = entry.pickOne;
    const chosen = options[Math.floor(Math.random() * options.length)];
    return resolveEntry(chosen, catalog, kitContext);
  }

  // Currency (крышки).
  if (entry.itemType === 'currency') {
    const count = entry.rollCount || 1;
    const items = [];
    for (let i = 0; i < count; i++) {
      const amount = rollD20Currency();
      items.push({
        id: `currency_${Date.now()}_${i}`,
        itemType: 'misc',
        subtype: 'currency',
        name: tWeaponsAndArmorScreen('kitResolver.currency'),
        quantity: amount,
        weight: 0,
        cost: amount,
        stackKey: `currency:${amount}`,
      });
    }
    return items;
  }

  // Бросок по таблице лута (d20 → таблица).
  if (entry.rollType === 'rollD20' && entry.tableId) {
    const count = entry.quantity || 1;
    const result = await resolveRandomLootByRoll(entry.tableId, count);
    return result || [];
  }

  // Боевой кубик (CD) — определяет количество.
  let quantity = entry.quantity || 1;
  if (entry.rollType === 'rollCD') {
    quantity = rollCD(entry.base, entry.rollValue);
  }

  // Патроны из комплекта (SMALL_GUNS).
  if (entry.itemType === 'ammo_from_kit') {
    if (!kitContext?.ammoFromKit) {
      debugLog('skillRewards.noKitAmmo', { skill: 'SMALL_GUNS' });
      return [];
    }
    const base = findInCatalog(catalog, kitContext.ammoFromKit, 'ammo');
    if (!base) return [];
    return [{
      ...base,
      itemType: 'ammo',
      quantity,
      stackKey: `ammo:${kitContext.ammoFromKit}`,
    }];
  }

  // Конкретный предмет.
  if (entry.itemId) {
    const base = findInCatalog(catalog, entry.itemId, entry.itemType);
    if (!base) {
      debugLog('skillRewards.itemNotFound', { id: entry.itemId, itemType: entry.itemType });
      return [];
    }
    return [{
      ...base,
      itemType: entry.itemType || base.itemType,
      quantity,
    }];
  }

  return [];
};

/**
 * Главная функция: берёт выбранные навыки, резолвит награды.
 * @param {string[]} skillKeys — ["ATHLETICS", "BARTER", ...]
 * @param {object} [options] — { ammoFromKit?: string } (id патрона из комплекта)
 * @returns {Promise<object[]>} — массив предметов для addNewItem
 */
export const resolveSkillRewards = async (skillKeys, options = {}) => {
  const catalog = getEquipmentCatalog();
  const kitContext = { ammoFromKit: options.ammoFromKit || null };
  const allItems = [];

  for (const skillKey of skillKeys) {
    const reward = rewardData[skillKey];
    if (!reward?.items?.length) continue;

    for (const entry of reward.items) {
      try {
        const items = await resolveEntry(entry, catalog, kitContext);
        allItems.push(...items);
      } catch (e) {
        debugLog('skillRewards.resolveError', { skillKey, error: e?.message });
      }
    }
  }

  debugLog('skillRewards.resolved', {
    skills: skillKeys,
    itemCount: allItems.length,
    items: allItems.map((i) => ({ id: i.id, name: i.name, qty: i.quantity })),
  });

  return allItems;
};
