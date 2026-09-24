// ПРИЁМОЧНЫЙ (патч 356): механизм проверок — сложность 0 спрашивает про бросок.
// Слово владельца: «Если сложность 0, то спросить пользователя хочет ли он
// бросить кубики. Если "да" бросаем и действуют правила Успехов/Провалов,
// "нет" = автоуспех, без броска». Механизм — на уровне движка проверок
// (runCraft, опция zeroDifficulty), потребители: крафт (окно + кнопка модалки).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import { runCraft, evaluateCraft } from '../../domain/craftingEngine';
import { getCraftingRecipeById } from '../../domain/registry';
import { craftRecipe } from '../../modules/fallout/crafting/operations';
import { buildCategoryModel } from '../../modules/fallout/crafting/windowModel';
import { readFileSync } from 'node:fs';

const state = () => useCharacterStore.getState();
const seed = (weaponId, quantity = 1) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`s_${Math.random().toString(36).slice(2, 8)}`]: { weaponId, quantity } },
  }));
};

const RECIPE = () => getCraftingRecipeById('mod_001'); // сложность 3, Фанатик оружия 1

const engineRun = (zeroDifficulty, rollD20) => runCraft({
  recipe: RECIPE(),
  skillRank: 6, // навык снимает сложность → difficulty 0, evaluation.auto
  perkRanks: { gunNut: 1 },
  inventoryCounts: { item_common_materials: 4, item_uncommon_materials: 2 },
  zeroDifficulty,
  ...(rollD20 ? { rollD20 } : {}),
  rollCD: () => 0,
  spend: () => ({ ok: true }),
  grant: () => ({ instanceId: 'g1' }),
});

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 356): сложность 0 — бросок по выбору игрока', () => {
  it('движок: сложность снята навыком → evaluation.auto (как раньше)', () => {
    const evaluation = evaluateCraft({
      recipe: RECIPE(),
      skillRank: 6,
      perkRanks: { gunNut: 1 },
      inventoryCounts: { item_common_materials: 4, item_uncommon_materials: 2 },
    });
    expect(evaluation.auto).toBe(true);
    expect(evaluation.difficulty).toBe(0);
  });

  it('движок: по умолчанию (auto) — автоуспех БЕЗ броска, check null', () => {
    let rolled = 0;
    const result = engineRun('auto', () => { rolled += 1; return 10; });
    expect(result.done).toBe(true);
    expect(result.auto).toBe(true); // «броска не было»
    expect(result.check).toBeNull();
    expect(rolled).toBe(0); // кубики не звались
  });

  it('движок: roll — кубики брошены, правила Успехов/Провалов действуют', () => {
    // канон 2d20 (см. scoreD20): 1 = крит (2 успеха), 20 = осложнение,
    // успех кубика — roll ≤ target (ИНТ + навык).
    const result = engineRun('roll', () => 15);
    expect(result.done).toBe(true);
    expect(result.auto).toBe(false); // бросок был — отчёт покажет кубики
    expect(result.check).toBeTruthy();
    expect(result.check.passed).toBe(true);
    expect(result.check.rolls).toEqual([15, 15]);
    expect(result.check.successes).toBe(0); // 15 > 6 (цель) — успеха кубики не дали
    expect(result.check.complicationCount).toBe(0);
  });

  it('движок: roll — крит на единицах (2 успеха за кубик)', () => {
    const result = engineRun('roll', () => 1);
    expect(result.done).toBe(true);
    expect(result.check.successes).toBe(4); // оба кубика — криты
    expect(result.check.complicationCount).toBe(0);
  });

  it('движок: roll — осложнение на двадцатках: две = АВТОПРОВАЛ', () => {
    const result = engineRun('roll', () => 20);
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.check.complicationCount).toBe(2);
  });

  it('движок: roll — одна двадцатка даёт осложнение при успехе (+время)', () => {
    const rolls = [20, 1]; // двадцатка = осложнение, единица = крит (2 успеха)
    const result = engineRun('roll', () => rolls.shift() ?? 1);
    expect(result.done).toBe(true);
    expect(result.check.complicationCount).toBe(1);
    expect(result.check.successes).toBe(2);
    expect(result.durationMultiplier).toBe(1); // 323: надбавка аддитивная у вызывающего
  });

  it('крафт по кнопке: craftRecipe проксирует zeroDifficulty в движок', () => {
    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));
    const rolled = craftRecipe('mod_001', { rollD20: () => 1 }, { deferTime: true, zeroDifficulty: 'roll' });
    expect(rolled.done).toBe(true);
    expect(rolled.auto).toBe(false);
    expect(rolled.check).toBeTruthy();

    // первый крафт потратил материалы — пересеиваем на второй
    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    const auto = craftRecipe('mod_001', {}, { deferTime: true });
    expect(auto.done).toBe(true);
    expect(auto.auto).toBe(true);
    expect(auto.check).toBeNull();
  });

  it('строки окна крафта знают zeroDifficulty; оба UI спрашивают игрока', () => {
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));
    const row = buildCategoryModel('weapons').find((r) => r.recipeId === 'mod_001');
    expect(row.zeroDifficulty).toBe(true);

    const crafting = readFileSync('modules/fallout/screens/InventoryScreen/modals/CraftingModal.js', 'utf8');
    expect(crafting).toContain('askZeroRoll');
    expect(crafting).toContain("zeroDifficulty");
    const modal = readFileSync('modules/fallout/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js', 'utf8');
    expect(modal).toContain('craftingPreview');
    expect(modal).toContain('createAskZeroRoll');
    expect(modal).toContain("zeroDifficulty");
  });
});
