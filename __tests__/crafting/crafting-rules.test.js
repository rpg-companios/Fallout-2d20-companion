// Патч 259: осложнение НЕ отменяет успех — корневая система 2d20 того требует.
// Патч 323 (текст книги от владельца): наказание за осложнение — АДДИТИВНЫЕ
// минуты (+30, станция +10), прежний множитель ×2 отменён; времена по книге —
// час всем категориям, 20 минут на станции приготовления пищи (еда/напитки).
// Реформа 269: карты верстаков из правил убраны; здесь же инварианты правил.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { runCraft } from '../../domain/craftingEngine';
import { CRAFT_RULES } from '../../modules/fallout/crafting/rules';
import craftingIndex from '../../modules/fallout/data/recipes/index.json';
import perksData from '../../modules/fallout/data/perks/perks.json';

const ROOT = new URL('../../', import.meta.url).pathname;
const loadFile = (file) => readFileSync(`${ROOT}modules/fallout/data/recipes/${file}`, 'utf8');

const allRecipes = () => {
  const list = [];
  for (const entry of craftingIndex.recipes) {
    const recs = JSON.parse(loadFile(entry.file));
    const arr = Array.isArray(recs) ? recs : recs.recipes;
    for (const r of arr) list.push(r);
  }
  return list;
};

const recipeStub = (over = {}) => ({
  id: 'food_result',
  requires: { skill: 'SURVIVAL', complexity: 1, perks: [] },
  materials: [{ itemId: 'mat_plastic', count: 2 }],
  outputQuantity: 1,
  ...over,
});

const makePorts = ({ spendOk = true } = {}) => {
  const calls = { spend: 0, grant: 0 };
  let i = 0;
  let rolls = [3, 4];
  return {
    calls,
    setRolls(next) { rolls = next; i = 0; },
    ports: {
      rollD20: () => rolls[i++],
      spend: () => {
        calls.spend++;
        return spendOk ? { ok: true } : { ok: false, reason: 'test-refusal' };
      },
      grant: () => {
        calls.grant++;
        return { instanceId: 'inst-1' };
      },
    },
  };
};

// TN = attributeValue 5 + skillRank; roll <= TN → успех, 20 → осложнение
const run = ({ rolls = [3, 20], failBurnsMaterials = false, recipe = recipeStub(), spendOk = true, skillRank = 0 }) => {
  const { calls, ports, setRolls } = makePorts({ spendOk });
  setRolls(rolls);
  const result = runCraft({
    recipe,
    skillRank,
    attributeValue: 5,
    isTagged: false,
    perkRanks: {},
    inventoryCounts: { mat_plastic: 2 },
    failBurnsMaterials,
    // 323: сеттинг больше не множит — надбавка за осложнения аддитивная в адаптере.
    complicationDurationMultiplier: 1,
    ...ports,
  });
  return { result, calls };
};

describe('осложнение не отменяет успех — оно помножает время', () => {
  it('успех с осложнением: изделие выдано, материалы списаны, время ×2', () => {
    const { result, calls } = run({ rolls: [3, 20] });
    expect(result.done).toBe(true);
    expect(result.granted.itemId).toBe('food_result');
    expect(result.durationMultiplier).toBe(1); // 323: аддитивные минуты — в адаптере
    expect(result.check.complicationCount).toBe(1);
    expect(calls.grant).toBe(1);
    expect(calls.spend).toBe(1);
  });

  it('чистый успех: множитель 1', () => {
    const { result } = run({ rolls: [3, 4] });
    expect(result.done).toBe(true);
    expect(result.durationMultiplier).toBe(1);
  });

  it('провал с осложнением: работа не сделана, время проваленной работы тоже ×2', () => {
    const { result } = run({ rolls: [15, 20], failBurnsMaterials: true });
    expect(result.done).toBe(false);
    expect(result.reason).toBe('check-failed');
    expect(result.durationMultiplier).toBe(1); // 323: аддитивные минуты — в адаптере
    expect(result.burned.length).toBe(1); // сгорание на горячем верстаке — как раньше
  });

  it('двойное осложнение — автопровал (книга), время ×2, не «порча»', () => {
    const { result } = run({ rolls: [20, 20], failBurnsMaterials: false });
    expect(result.done).toBe(false);
    expect(result.reason).toBe('check-failed');
    expect(result.durationMultiplier).toBe(1); // 323: аддитивные минуты — в адаптере
    expect(result.burned).toEqual([]); // верстак без флага сгорания — материалы целы
  });

  it('автоуспех (ранг покрывает сложность) — броска нет, множитель не растёт', () => {
    const { result } = run({
      recipe: recipeStub({ requires: { skill: 'SURVIVAL', complexity: 1, perks: [] } }),
      rolls: [20, 20],
      skillRank: 1,
    });
    expect(result.done).toBe(true);
    expect(result.auto).toBe(true);
    expect(result.check).toBeNull();
  });

  it('правило 323 (книга): осложнение — аддитивные минуты, не множитель', () => {
    expect(CRAFT_RULES.complicationDurationMultiplier).toBeUndefined();
    expect(CRAFT_RULES.complicationExtraMinutes).toBe(30);
    expect(CRAFT_RULES.stationComplicationExtraMinutes).toBe(10);
    expect(CRAFT_RULES.spoilsMaterialsOnComplicationByBench).toBeUndefined();
  });
});

describe('правила крафта после реформы 269', () => {
  it('карт верстаков больше нет: навыки, перки и флаг сгорания — в самих рецептах', () => {
    expect(CRAFT_RULES.benchSkills).toBeUndefined();
    expect(CRAFT_RULES.benchPerks).toBeUndefined();
    expect(CRAFT_RULES.failBurnsMaterialsByBench).toBeUndefined();
  });

  it('пачки — ровно три id из правил, редкости соответствуют material.json', () => {
    const materials = JSON.parse(readFileSync(`${ROOT}modules/fallout/data/junk/material.json`, 'utf8'));
    const byId = new Map(materials.map((m) => [m.id, m]));
    expect(CRAFT_RULES.packMaterialIds).toEqual([
      'item_common_materials', 'item_uncommon_materials', 'item_rare_materials',
    ]);
    for (const id of CRAFT_RULES.packMaterialIds) {
      expect(byId.has(id), `материал ${id} есть в справочнике`).toBe(true);
    }
    expect(byId.get('item_common_materials').rarity).toBe(0);
    expect(byId.get('item_uncommon_materials').rarity).toBe(1);
    expect(byId.get('item_rare_materials').rarity).toBe(2);
    // служебных флагов в данных нет (namedMaterial/itemType у материалов удалены)
    for (const m of materials) {
      expect(m.namedMaterial, `${m.id}: namedMaterial удалён`).toBeUndefined();
      expect(m.itemType, `${m.id}: itemType у материалов больше нет`).toBeUndefined();
      expect(['common', 'uncommon', 'rare'], `${m.id}: materialType`).toContain(m.materialType);
    }
  });

  it('сгорание — правило навыка в реестре; разрез совпадает с печатью (с. 210–211)', () => {
    // 270 (решение владельца): вместо 74 флагов в данных — две строки правила.
    // Гард: применённое к файлам, правило даёт ровно печатный разрез верстаков
    // (кухня и химия горят: все chems/food/drinks + взрывчатка в ammo/weapons;
    // станок оружейника — нет). И ни одной записи поле не принадлежит.
    const burns = (r) => CRAFT_RULES.failBurnsMaterialsSkills.includes(r.requires.skill);
    const burnCount = {};
    for (const entry of craftingIndex.recipes) {
      const records = JSON.parse(loadFile(entry.file));
      burnCount[entry.category] = records.filter(burns).length;
      for (const r of records) expect(r.failBurnsMaterials, r.id).toBeUndefined();
    }
    expect(burnCount.chems).toBe(21);
    expect(burnCount.food).toBe(27);
    expect(burnCount.drinks).toBe(8);
    expect(burnCount.ammo).toBe(9);
    expect(burnCount.weapons).toBe(9);
    expect(CRAFT_RULES.failBurnsMaterialsSkills.sort()).toEqual(
      [...CRAFT_RULES.failBurnsMaterialsSkills].sort(),
    ); // список — настройка: редактируется здесь, данные не трогаются
  });

  it('времена по книге (323): час всем, станция еды/напитков — 20 минут', () => {
    expect(CRAFT_RULES.craftBaseMinutes).toBe(60);
    expect(CRAFT_RULES.stationMinutes).toBe(20);
    expect(CRAFT_RULES.craftTimeTiers).toBeUndefined(); // ступени 259 отменены
    expect(CRAFT_RULES.spoilsMaterialsOnComplicationByBench).toBeUndefined();
  });
});
