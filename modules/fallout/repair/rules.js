// modules/fallout/repair/rules.js
//
// Правила ремонта (патч 413 — механика от владельца, книга):
//   - тест ИНТ + Ремонт, сложность = редкость предмета
//     (+1 за каждую установленную модификацию, −1 за разборку донора);
//   - время — полчаса; при успехе 2 ОД сокращают вдвое (15 минут);
//   - осложнение: д20 19–20 = потеря дополнительных материалов,
//     иначе +15 минут;
//   - материалы по редкости — книжная таблица ниже.

export const REPAIR_RULES = {
  testAttribute: 'INT',
  testSkill: 'REPAIR',
  baseMinutes: 30,
  complicationExtraMinutes: 15,
  apCostToHalve: 2,
};

const COMMON = 'item_common_materials';
const UNCOMMON = 'item_uncommon_materials';
const RARE = 'item_rare_materials';

// Книжная таблица «Материалы, необходимые для ремонта»:
// редкость → комплект материалов.
export const REPAIR_MATERIALS_BY_RARITY = [
  { maxRarity: 0, plan: [{ itemId: COMMON, count: 1 }] },
  { maxRarity: 1, plan: [{ itemId: COMMON, count: 2 }] },
  { maxRarity: 2, plan: [{ itemId: COMMON, count: 2 }, { itemId: UNCOMMON, count: 1 }] },
  { maxRarity: 3, plan: [{ itemId: COMMON, count: 2 }, { itemId: UNCOMMON, count: 2 }] },
  { maxRarity: 4, plan: [{ itemId: COMMON, count: 2 }, { itemId: UNCOMMON, count: 2 }, { itemId: RARE, count: 1 }] },
  // 5+ (сверхредкие предметы)
  { maxRarity: Infinity, plan: [{ itemId: COMMON, count: 3 }, { itemId: UNCOMMON, count: 3 }, { itemId: RARE, count: 1 }] },
];

export const repairMaterialsPlan = (rarity) => {
  const value = Math.max(0, Math.floor(Number(rarity) || 0));
  const row = REPAIR_MATERIALS_BY_RARITY.find((entry) => value <= entry.maxRarity);
  return row ? row.plan.map((entry) => ({ ...entry })) : [];
};
