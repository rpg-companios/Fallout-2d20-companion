// domain/skillRewards.js
// Резолвит награды за выбранные навыки из data/skillRewards.json.
// Механизм похож на kitResolver, но без UI — молча добавляет предметы в стор.

import rewardData from '../modules/fallout/data/skillRewards.json';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { resolveRandomLootByRoll } from '../modules/fallout/screens/CharacterScreen/logic/RandomLootLogic';
import { evaluateRollConfig } from './diceRollsLogic';
import { findCatalogEntry } from './resolveItem';
import { debugLog } from '../src/debug/falloutDebug';

const toNumber = (v) => Number.isFinite(v) ? v : Number(v) || 0;

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

  // Currency (крышки) — идёт в счётчик крышек, а не в инвентарь (как у комплектов:
  // handleSelectKit делает setCaps(prev => prev + kit.caps)). В инвентаре крышек
  // быть не должно — у них нет каталоговой записи, и «две стопки по 9 и 17»
  // возникали именно отсюда.
  if (entry.itemType === 'currency') {
    const count = entry.rollCount || 1;
    let caps = 0;
    for (let i = 0; i < count; i++) caps += rollD20Currency();
    return { items: [], caps };
  }

  // Бросок по таблице лута (d20 → таблица).
  if (entry.rollType === 'rollD20' && entry.tableId) {
    const count = entry.quantity || 1;
    const result = await resolveRandomLootByRoll(entry.tableId, count);
    return { items: result || [], caps: 0 };
  }

  // Боевой кубик (CD) — определяет количество.
  let quantity = entry.quantity || 1;
  if (entry.rollType === 'rollCD') {
    quantity = rollCD(entry.base, entry.rollValue);
  }

  // Патроны из комплекта (SMALL_GUNS). Без явного stackKey — addNewItem сгенерит
  // подпись по каноническому id (как у патронов из комплекта), и награда стакается
  // с уже лежащими патронами, а не плодит отдельную стопку ammo:<id>.
  if (entry.itemType === 'ammo_from_kit') {
    if (!kitContext?.ammoFromKit) {
      debugLog('skillRewards.noKitAmmo', { skill: 'SMALL_GUNS' });
      return { items: [], caps: 0 };
    }
    const base = findCatalogEntry(catalog, kitContext.ammoFromKit, 'ammo');
    if (!base) return { items: [], caps: 0 };
    return {
      items: [{ ...base, itemType: 'ammo', quantity }],
      caps: 0,
    };
  }

  // Конкретный предмет.
  if (entry.itemId) {
    const base = findCatalogEntry(catalog, entry.itemId, entry.itemType);
    if (!base) {
      debugLog('skillRewards.itemNotFound', { id: entry.itemId, itemType: entry.itemType });
      return { items: [], caps: 0 };
    }
    return {
      items: [{
        ...base,
        itemType: entry.itemType || base.itemType,
        quantity,
      }],
      caps: 0,
    };
  }

  return { items: [], caps: 0 };
};

/**
 * Главная функция: берёт выбранные навыки, резолвит награды.
 * @param {string[]} skillKeys — ["ATHLETICS", "BARTER", ...]
 * @param {object} [options] — { ammoFromKit?: string } (id патрона из комплекта)
 * @returns {Promise<{ items: object[], caps: number }>}
 *   items  — предметы для addNewItem;
 *   caps   — крышки (BARTER), их надо провести через setCaps, а не addNewItem.
 */
export const resolveSkillRewards = async (skillKeys, options = {}) => {
  const catalog = getEquipmentCatalog();
  const kitContext = { ammoFromKit: options.ammoFromKit || null };
  const allItems = [];
  let caps = 0;

  for (const skillKey of skillKeys) {
    const reward = rewardData[skillKey];
    if (!reward?.items?.length) continue;

    for (const entry of reward.items) {
      try {
        const { items, caps: entryCaps } = await resolveEntry(entry, catalog, kitContext);
        allItems.push(...items);
        caps += entryCaps;
      } catch (e) {
        debugLog('skillRewards.resolveError', { skillKey, error: e?.message });
      }
    }
  }

  debugLog('skillRewards.resolved', {
    skills: skillKeys,
    itemCount: allItems.length,
    caps,
    items: allItems.map((i) => ({ id: i.id, name: i.name, qty: i.quantity })),
  });

  return { items: allItems, caps };
};
