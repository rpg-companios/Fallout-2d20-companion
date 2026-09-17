// Патч 263, этап 4: дуальность материалов крафта. Именованный материал своей
// редкости закрывает пачковый слот; порядок списания — сначала пачки, затем
// закрытие по возрастанию цены; редкости не смешиваются; точные строки
// рецепта резервируют своё до закрытия.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { getItemId } from '../../domain/itemIdentity';
import { getCraftingRecipes } from '../../domain/registry';
import { craftRecipe, craftingPreview } from '../../modules/fallout/crafting/operations';
import { CRAFT_RULES } from '../../modules/fallout/crafting/rules';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
  CRAFT_RULES.packSubstitutionByRarity = true;
});

afterEach(async () => {
  CRAFT_RULES.packSubstitutionByRarity = true;
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const give = (itemId, quantity = 1) => state().addNewItem({ itemId, quantity });
const countOf = (itemId) => Object.values(state().items)
  .reduce((sum, item) => (getItemId(item) === itemId ? sum + (Number(item.quantity) || 1) : sum), 0);
// Навык, снимающий проверку до автоуспеха (сложность = Complexity − ранг, ≥0).
const setSkill = (skillId, total) => useCharacterStore.setState((prev) => ({
  skills: { ...prev.skills, [skillId]: { ...(prev.skills?.[skillId] ?? {}), base: total, total } },
}));

const rowsOf = (result) => result.spent.map(({ itemId, count }) => [itemId, count]);

describe('именованный материал закрывает пачковый слот', () => {
  // ammo_syringe_pax: nuka×1 + mutfruit×2 + common-пачка×1 (Complexity 3, без перков).
  const pax = 'ammo_syringe_pax';

  it('закрытие: стальной вместо пачки — крафт проходит и тратит сталь', () => {
    setSkill('SCIENCE', 3);
    give('drink_nuka_cola');
    give('food_mutfruit', 2);
    give('steel', 1);
    const result = craftRecipe(pax);
    expect(result.done).toBe(true);
    expect(rowsOf(result)).toEqual([['drink_nuka_cola', 1], ['food_mutfruit', 2], ['steel', 1]]);
    expect(countOf('steel')).toBe(0);
    expect(result.granted.itemId).toBe(pax);
  });

  it('сначала пачки: при наличии пачки закрытие не тратится', () => {
    setSkill('SCIENCE', 3);
    give('drink_nuka_cola');
    give('food_mutfruit', 2);
    give('item_common_materials', 1);
    give('steel', 2);
    const result = craftRecipe(pax);
    expect(result.done).toBe(true);
    expect(rowsOf(result)).toEqual([['drink_nuka_cola', 1], ['food_mutfruit', 2], ['item_common_materials', 1]]);
    expect(countOf('steel')).toBe(2); // дорогое закрытие бережём — пачка подешевле
  });

  it('редкости не смешиваются: редкий материал общий слот не закрывает', () => {
    setSkill('SCIENCE', 3);
    give('drink_nuka_cola');
    give('food_mutfruit', 2);
    give('asbestos', 5); // rare
    const result = craftRecipe(pax);
    expect(result.done).toBe(false);
    expect(result.stage).toBe('gate');
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: 'missing-material', itemId: 'item_common_materials' }),
    );
    expect(countOf('asbestos')).toBe(5);
  });

  it('превью видит покрытие: have пачки = пачки + свободное закрытие', () => {
    setSkill('SCIENCE', 3);
    give('drink_nuka_cola');
    give('food_mutfruit', 2);
    give('steel', 1);
    give('plastic', 4); // общий материал той же редкости — тоже в пуле закрытия
    const preview = craftingPreview(pax);
    const packRow = preview.evaluation.materials.find((m) => m.itemId === 'item_common_materials');
    expect(packRow.have).toBe(5); // 0 пачек + сталь 1 + пластика 4
    expect(preview.evaluation.ready).toBe(true);
  });

  it('выключенный флаг: старая правда — только пачки', () => {
    setSkill('SCIENCE', 3);
    give('drink_nuka_cola');
    give('food_mutfruit', 2);
    give('steel', 3);
    CRAFT_RULES.packSubstitutionByRarity = false;
    const result = craftRecipe(pax);
    expect(result.done).toBe(false);
    expect(result.stage).toBe('gate');
    expect(countOf('steel')).toBe(3);
  });
});

describe('закрытие по порядку цены', () => {
  // ammo_syringe_yellow_belly: uncommon-пачка×5 (Complexity 4, без перков).
  const recipe = 'ammo_syringe_yellow_belly';

  it('пачки + дешёвое закрытие первыми', () => {
    setSkill('SCIENCE', 4);
    give('item_uncommon_materials', 3);
    give('cork', 2); // цена 1 — первое закрытие
    give('glass', 2); // цена 2 — не тратится, пока хватает пробки
    const result = craftRecipe(recipe);
    expect(result.done).toBe(true);
    expect(rowsOf(result)).toEqual([['item_uncommon_materials', 3], ['cork', 2]]);
    expect(countOf('glass')).toBe(2);
    expect(countOf('cork')).toBe(0);
  });
});

describe('страховки данных', () => {
  it('в одном рецепте не встречается двух строк с одним itemId (резерв и have считаются по этому допущению)', () => {
    for (const recipe of getCraftingRecipes()) {
      const ids = recipe.materials.map((m) => m.itemId);
      if (new Set(ids).size !== ids.length) throw new Error(`дубли строк в ${recipe.id}`);
    }
  });
});
