// __tests__/crafting/crafting-operations.test.js
//
// Адаптер сеттинга (патч 251): движок на НАСТОЯЩИХ данных пакета — рецепты из
// реестра, стор, списание и выдача. Кубики подменены, где важна достоверность
// ветки (проверка/осложнения); боевые кубики количества — всегда детерминированы.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { craftRecipe, craftingPreview } from '../../modules/fallout/crafting/operations';
import { CRAFT_RULES } from '../../modules/fallout/crafting/rules';
import { getCraftingRecipeById, getCraftingRecipes } from '../../domain/registry';
import craftingIndex from '../../modules/fallout/data/recipes/index.json';
import ammoFile from '../../modules/fallout/data/recipes/ammo.json';
import chemsFile from '../../modules/fallout/data/recipes/chems.json';
import foodFile from '../../modules/fallout/data/recipes/food.json';
import weaponsFile from '../../modules/fallout/data/recipes/weapons.json';
import drinksFile from '../../modules/fallout/data/recipes/drinks.json';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

// СТОК в сумку: канон — weaponId (та же цепочка getItemId, что у addNewItem).
const seedStack = (itemId, quantity, extra = {}) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
      weaponId: itemId, quantity, ...extra,
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

describe('реестр — точка, откуда движок крафта видит данные', () => {
  it('все файлы категории собраны индексом без потерь', () => {
    const byFile = {
      'ammo.json': ammoFile, 'weapons.json': weaponsFile, 'chems.json': chemsFile,
      'food.json': foodFile, 'drinks.json': drinksFile,
    };
    const declared = craftingIndex.recipes.reduce((sum, entry) => sum + entry.count, 0);
    expect(getCraftingRecipes()).toHaveLength(declared);
    for (const entry of craftingIndex.recipes) {
      expect(byFile[entry.file]).toHaveLength(entry.count);
    }
  });

  it('рецепт находится по id и это тот же объект, что в файле', () => {
    const viaRegistry = getCraftingRecipeById('chem_mentats');
    expect(viaRegistry).toBeTruthy();
    // Реестр дополняет запись категорией из манифеста (269); поля рецепта — нетронуты.
    expect(viaRegistry).toEqual({ ...chemsFile.find((r) => r.id === 'chem_mentats'), category: 'chems' });
    // Числа владельца доехали до движка нетронутыми.
    expect(viaRegistry.materials).toEqual([
      { itemId: 'food_brain_fungus', count: 2 },
      { itemId: 'item_rare_materials', count: 2 },
      { itemId: 'item_uncommon_materials', count: 3 },
    ]);
  });

  it('несуществующий id — честный отказ, а не исключение', () => {
    expect(getCraftingRecipeById('nope')).toBeNull();
    expect(craftRecipe('nope')).toMatchObject({ done: false, stage: 'unknown', reason: 'recipe-not-found' });
  });
});

describe('craftRecipe: автоуспех, списание и выдача', () => {
  it('.38: материалы сгорели в работе, патроны выданы пачкой base+CD', () => {
    const recipe = getCraftingRecipeById('ammo_38');
    setSkill('REPAIR', recipe.requires.complexity); // автоуспех
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith' }] }); // книга: патроны gated перком
    seedStack('item_common_materials', 3);

    const result = craftRecipe('ammo_38', { rollCD: (cd) => cd * 3 }); // 10 + 5×3 = 25
    expect(result.done).toBe(true);
    expect(result.auto).toBe(true);
    expect(result.granted).toMatchObject({ itemId: 'ammo_38', quantity: 25 });
    expect(countStack('item_common_materials')).toBe(3 - recipe.materials[0].count);
    expect(countStack('ammo_38')).toBe(25);
  });

  it('нехватка материала — отказ, состояние стора не тронуто', () => {
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith' }] });
    const before = state().items;
    const result = craftRecipe('ammo_38');
    expect(result.done).toBe(false);
    expect(result.stage).toBe('gate');
    expect(result.reasons[0]).toMatchObject({ code: 'missing-material', itemId: 'item_common_materials' });
    expect(state().items).toBe(before);
  });

  it('гейт по особенности (Chemist) и ранг, покрывающий требование', () => {
    const fury = getCraftingRecipeById('chem_fury');
    expect(fury.requires.perks).toEqual([{ perkId: 'chemist', rank: 1 }]);
    seedStack('chem_buffout', 1);
    seedStack('ammo_syringe_berserk', 1);
    setSkill('SCIENCE', fury.requires.complexity);

    expect(craftRecipe('chem_fury').done).toBe(false); // нет перка
    expect(countStack('chem_buffout')).toBe(1); // и ничего не списано

    useCharacterStore.setState({ selectedPerks: [{ perkId: 'chemist' }] });
    const result = craftRecipe('chem_fury');
    expect(result.done).toBe(true);
    expect(countStack('chem_buffout')).toBe(0);
    expect(countStack('chem_fury')).toBe(1);
    expect(countStack('ammo_syringe_berserk')).toBe(0);
  });
});

describe('craftRecipe: провал проверки и цена проверки', () => {
  const bothDiceComplicate = () => 20; // обе кости «20» → осложнения → автопровал

  it('кухня: провал сжигает материалы — правило навыка в реестре (270)', () => {
    const soup = getCraftingRecipeById('food_vegetable_soup');
    expect(craftingPreview('food_vegetable_soup').rulesView.failBurnsMaterials).toBe(true);
    seedStack('food_carrot', 1);
    seedStack('drink_dirty_water', 1);
    seedStack('food_tato', 1);

    const result = craftRecipe('food_vegetable_soup', { rollD20: () => bothDiceComplicate() });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.burned.length).toBe(soup.materials.length);
    expect(countStack('food_carrot')).toBe(0);
    expect(countStack('food_vegetable_soup')).toBe(0);
  });

  it('рецепт без флага сгорания: провал не сжигает ничего', () => {
    // «Молотов» — не годится как пример: по книге взрывчатка делается в химии и
    // там провал жжёт. Берём .45: проверочный станок не «горячий», права сжигать нет.
    const shell = getCraftingRecipeById('ammo_45');
    expect(shell.category).toBe('ammo');
    expect(craftingPreview('ammo_45').rulesView.failBurnsMaterials, 'станок не горит').toBe(false);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith' }, { perkId: 'ammosmith' }] }); // ранг 2
    for (const material of shell.materials) seedStack(material.itemId, material.count);
    const before = state().items;

    const result = craftRecipe('ammo_45', { rollD20: () => bothDiceComplicate() });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.spent).toEqual([]);
    expect(state().items).toBe(before);
  });

  it('атрибут проверки берётся из правил модуля, не из данных рецептов', () => {
    expect(CRAFT_RULES.testAttribute).toBeTruthy();
    expect(getCraftingRecipes().every((recipe) => !('attribute' in recipe.requires))).toBe(true);
  });
});

describe('craftingPreview: экранное «можно ли» без мутаций', () => {
  it('пустая сумка показывает цену и дефициты', () => {
    const view = craftingPreview('chem_stimpak');
    expect(view.recipe).toBeTruthy();
    const { evaluation } = view;
    expect(evaluation.ready).toBe(false);
    expect(evaluation.difficulty).toBe(view.recipe.requires.complexity); // ранг 0
    expect(evaluation.materials.find((m) => m.itemId === 'antiseptic'))
      .toMatchObject({ need: 2, have: 0, enough: false });
    expect(state().items).toEqual({});
  });

  it('полная сумка — ready, и превью совпадает с результатом', () => {
    for (const material of getCraftingRecipeById('chem_stimpak').materials) {
      seedStack(material.itemId, material.count);
    }
    setSkill('SCIENCE', 3);
    const before = craftingPreview('chem_stimpak');
    expect(before.evaluation.ready).toBe(true);
    expect(craftRecipe('chem_stimpak').done).toBe(true);
    expect(countStack('chem_stimpak')).toBe(1);
    expect(countStack('antiseptic')).toBe(0);
  });
});
