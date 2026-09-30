// ПРИЁМОЧНЫЙ (патч 404): «Ломовые патроны» — у верстака патроны редкости
// вплоть до 1 (ранг 1) / 2 (ранг 2) крафтятся из 5 единиц любого хлама
// за 10 минут; атаки такими патронами получают Диапазон осложнений +1
// (напоминалка в отчёте о крафте). Универсальный движок не тронут:
// подмену делает адаптер сеттинга (operations.js).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { craftRecipe, craftingPreview, craftMinutesForRecipe, juryRigFor } from '../../modules/fallout/crafting/operations';
import { buildCategoryModel, buildCraftReport } from '../../modules/fallout/crafting/windowModel';
import { getCraftingRecipeById } from '../../domain/registry';
import { selectPerkBonuses } from '../../domain/perks';
import { juryRiggedAmmoPerk, juryRigMaxRarityByRank, JUNK_RIG_ANY_ID } from '../../domain/perks/juryRiggedAmmo';
import { CRAFT_RULES } from '../../modules/fallout/crafting/rules';
import perksCatalog from '../../modules/fallout/data/perks/perks.json';
import { setCurrentModuleLocale } from '../../i18n/locale';

const state = () => useCharacterStore.getState();
// 412: персонаж в тестах отвечает книжным требованиям выданных перков
// (недоступные по книге ранги теперь честно гасятся мигратором 412).
const grantBookProfile = (level, attrs = {}) => {
  const base = { STR: 5, PER: 5, END: 5, CHA: 5, INT: 5, AGI: 5, LCK: 5, ...attrs };
  useCharacterStore.setState({
    level,
    attributes: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { total: v }])),
  });
};


// Строки окна крафта локализованы — тесты идут по русским словарям.
setCurrentModuleLocale('ru-RU');

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

// СТОК в сумку: канон — weaponId (та же цепочка, что у addNewItem).
const seedStack = (itemId, quantity) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
      weaponId: itemId, quantity,
    } },
  }));
};

const countStack = (itemId) => Object.values(state().items)
  .filter((item) => item.weaponId === itemId)
  .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

const setSkill = (skillId, total) => {
  useCharacterStore.setState((prev) => ({
    skills: { ...prev.skills, [skillId]: { ...(prev.skills?.[skillId] ?? {}), base: total, total } },
  }));
};

// Перк выбирается рангами (как в экране перков: ранг = число выбранных строк).
const takePerk = (rank) => {
  const jury = Array.from({ length: rank }, (_, index) => ({ perkId: 'juryRiggedAmmo', index }));
  // ammosmith той же глубины: редкость 2 закрыта перком 2-го ранга (книга).
  const smith = Array.from({ length: rank }, (_, index) => ({ perkId: 'ammosmith', index }));
  // книга: Ломовые патроны 2-го ранга — УДЧ6 с 10-го уровня; Патронщик — ИНТ7
  grantBookProfile(10, { LCK: 6, INT: 7 });
  useCharacterStore.setState({ selectedPerks: [...jury, ...smith] });
};

const AUTO = { rollD20: () => ({ rolled: [20], passed: true, successes: 1, complicationCount: 0 }) };

describe('Патч 404: Ломовые патроны — перк и селектор', () => {
  it('ранг 1 → редкость 1, ранг 2+ → редкость 2; хлам 5, время 10 минут', () => {
    expect(juryRigMaxRarityByRank(1)).toBe(1);
    expect(juryRigMaxRarityByRank(2)).toBe(2);
    expect(juryRigMaxRarityByRank(3)).toBe(2);
    expect(juryRiggedAmmoPerk.apply({ state: { rank: 2 } })).toEqual({
      juryRiggedAmmo: { maxRarity: 2, junkCost: 5, minutes: 10 },
    });
    const bonuses = selectPerkBonuses(
      { selectedPerks: [{ id: 'juryRiggedAmmo', rank: 1 }], level: 6, attributes: { LCK: { total: 6 } } },
      perksCatalog,
    );
    expect(bonuses.juryRiggedAmmo).toEqual({ maxRarity: 1, junkCost: 5, minutes: 10 });
  });
});

describe('Патч 404: Ломовые патроны — превью и крафт', () => {
  it('.38 (редкость 1) с перком: материалы заменены «любой хлам ×5», время 10 минут', () => {
    takePerk(1);
    setSkill('REPAIR', 1); // сложность 1 − навык 1 = автоуспех
    seedStack('duct_tape', 3);
    seedStack('animal_hide', 2);

    const { evaluation, recipe } = craftingPreview('ammo_38');
    expect(evaluation.ready).toBe(true);
    expect(evaluation.materials).toEqual([
      { itemId: JUNK_RIG_ANY_ID, need: 5, have: 5, enough: true },
    ]);
    // Время в окне и в адаптере — ломовое.
    expect(craftMinutesForRecipe(recipe)).toBe(10);

    const result = craftRecipe('ammo_38', { rollCD: (cd) => cd * 3 });
    expect(result.done).toBe(true);
    expect(result.granted).toMatchObject({ itemId: 'ammo_38' });
    expect(result.time.minutes).toBe(10);
    // Списан реальный хлам (3 + 2), виртуального id в потраченном нет.
    expect(result.spent).toEqual([
      { itemId: 'duct_tape', count: 3 },
      { itemId: 'animal_hide', count: 2 },
    ]);
    expect(countStack('duct_tape')).toBe(0);
    expect(countStack('animal_hide')).toBe(0);
    expect(countStack('ammo_38')).toBe(result.granted.quantity);
  });

  it('без перка подмены нет: рецепт требует обычные материалы, время — час', () => {
    seedStack('duct_tape', 10);
    const { evaluation, recipe } = craftingPreview('ammo_38');
    expect(evaluation.ready).toBe(false);
    expect(evaluation.blocked.some((b) => b.code === 'missing-material' && b.itemId === 'item_common_materials')).toBe(true);
    expect(evaluation.materials.some((m) => m.itemId === JUNK_RIG_ANY_ID)).toBe(false);
    expect(craftMinutesForRecipe(recipe)).toBe(CRAFT_RULES.craftBaseMinutes);
    expect(juryRigFor(recipe)).toBeNull();
  });

  it('редкость 2 — только со 2-м рангом; редкость 3 не достаётся никому', () => {
    takePerk(1);
    seedStack('duct_tape', 10);
    expect(craftingPreview('ammo_45').evaluation.ready).toBe(false); // редкость 2, ранг 1

    takePerk(2);
    setSkill('REPAIR', 1);
    seedStack('duct_tape', 10);
    expect(craftingPreview('ammo_45').evaluation.ready).toBe(true); // редкость 2, ранг 2
    expect(craftingPreview('ammo_44_magnum').evaluation.ready).toBe(false); // редкость 3
    expect(craftingPreview('ammo_44_magnum').evaluation.blocked.some((b) => b.code === 'missing-material' && b.itemId === 'item_common_materials')).toBe(true);
  });

  it('хлама меньше 5 — крафтить нельзя, стор не тронут', () => {
    takePerk(1);
    setSkill('REPAIR', 1);
    seedStack('duct_tape', 4);
    const before = state().items;
    const result = craftRecipe('ammo_38');
    expect(result.done).toBe(false);
    expect(result.stage).toBe('gate');
    expect(state().items).toBe(before);
  });

  it('гейты рецепта (перк ammosmith) ломовая подмена не отменяет', () => {
    setSkill('REPAIR', 1);
    seedStack('duct_tape', 5);
    // Перка нет вовсе → .38 закрыт перком ammosmith, а не материалами.
    const { evaluation } = craftingPreview('ammo_38');
    expect(evaluation.blocked.some((b) => b.code === 'missing-perk' && b.perkId === 'ammosmith')).toBe(true);
  });
});

describe('Патч 404: Ломовые патроны — окно крафта и отчёт', () => {
  it('строка окна: «Хлам (любой)», 10 минут, зелёная кнопка при 5 хламе', () => {
    takePerk(1);
    setSkill('REPAIR', 1);
    seedStack('duct_tape', 5);
    const rows = buildCategoryModel('ammo');
    const row = rows.find((r) => r.recipeId === 'ammo_38');
    expect(row.canCraft).toBe(true);
    expect(row.minutes).toBe(10);
    expect(row.materials).toHaveLength(1);
    expect(row.materials[0]).toMatchObject({ itemId: JUNK_RIG_ANY_ID, name: 'Хлам (любой)', need: 5, have: 5, enough: true });
  });

  it('в отчёте — имя хлама, а не id; напоминалка про Диапазон осложнений +1', () => {
    takePerk(1);
    setSkill('REPAIR', 1);
    seedStack('duct_tape', 5);
    const result = craftRecipe('ammo_38', AUTO);
    expect(result.done).toBe(true);
    const report = buildCraftReport('ammo_38', { attempts: [result], stoppedEarly: 0 });
    const text = report.lines.join('\n');
    expect(text).not.toContain(JUNK_RIG_ANY_ID);
    expect(text).toContain('Диапазон осложнений +1');
  });

  it('обычный (не ломовой) крафт отчёт без напоминалки', () => {
    setSkill('REPAIR', 1);
    grantBookProfile(2, { INT: 7 });
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith' }] });
    seedStack('item_common_materials', 3);
    const result = craftRecipe('ammo_38', AUTO);
    expect(result.done).toBe(true);
    const report = buildCraftReport('ammo_38', { attempts: [result], stoppedEarly: 0 });
    expect(report.lines.join('\n')).not.toContain('Диапазон осложнений +1');
  });
});
