// ПРИЁМОЧНЫЙ (патч 341): крафт модов брони — квадрат «Броня» жив.
//   • 44 рецепта (диктованная таблица 327–340, материалы по материалоёмкости);
//   • проверка — ИНТ + Ремонт, сложность = ёмкость − ранг (правила 323);
//   • перковый гейт (Бронник/Наука!) работает как у остальных рецептов;
//   • провал жжёт материалы по группе gear (настройка 323);
//   • созданный мод — предмет в сумке с каталожным именем (окно установки
//     берёт моды из каталога, так что мод в сумке — результат теста владельца).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { buildCraftTiles, buildCategoryModel } from '../../modules/fallout/crafting/windowModel';
import { craftRecipe } from '../../modules/fallout/crafting/operations';
import { getCraftingRecipeById, getCraftingCategoryRules } from '../../domain/registry';
import { findCatalogEntry } from '../../domain/resolveItem';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
  useAppSettingsStore.getState().setValue('craftFailLossConsumables', true);
  useAppSettingsStore.getState().setValue('craftFailLossGear', true);
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const seedStack = (itemId, quantity) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
      weaponId: itemId, quantity,
    } },
  }));
};

const inventoryList = () => Object.values(state().items || {});

describe('Крафт модов брони (341): квадрат «Броня», проверка, мод в сумке', () => {
  it('квадрат «Броня»: 44 рецепта из диктованной таблицы', () => {
    const tiles = buildCraftTiles();
    const armor = tiles.find((t) => t.category === 'armor');
    expect(armor.recipes).toBe(44);
    expect(buildCategoryModel('armor').length).toBe(44);
    // Ремонт не жжёт материалы при провале (правило верстака брони)
    expect(getCraftingCategoryRules('armor').failBurnsMaterialsSkills).toEqual([]);
  });

  it('простой мод (Вываренная кожа, ёмкость 2): крафт успешен, мод в сумке с именем', () => {
    const recipe = getCraftingRecipeById('uniq_leather_boiled');
    expect(recipe.requires).toEqual({ skill: 'REPAIR', complexity: 2 });
    expect(recipe.materials).toEqual([{ itemId: 'item_common_materials', count: 3 }]);

    seedStack('item_common_materials', 3);
    // бросок 3 ≤ ИНТ+Ремонт → успех; сложность 2, ранг 0
    const result = craftRecipe('uniq_leather_boiled', { rollD20: () => 3 }, { deferTime: true });
    expect(result.done).toBe(true);
    expect(result.granted.itemId).toBe('uniq_leather_boiled');

    const inBag = inventoryList().find((i) => i.weaponId === 'uniq_leather_boiled');
    expect(inBag, 'мод-предмет в сумке').toBeTruthy();
    // имя мода разрешено из каталога (локаль тестов — en, в приложении будет ru)
    const catalog = getEquipmentCatalog();
    const catalogName = findCatalogEntry(catalog, 'uniq_leather_boiled', 'armorMod')?.name;
    expect(catalogName).toBe('Boiled Leather');
    expect(inBag.name).toBe(catalogName);
    // материалы списаны
    expect(inventoryList().filter((i) => i.weaponId === 'item_common_materials')
      .reduce((acc, i) => acc + (i.quantity || 0), 0)).toBe(0);
  });

  it('перковый гейт: «Плотная» (Бронник 3) без перка заблокирована, с перком — крафтится', () => {
    // без перка: строка есть, но reason «нужен перк»
    const blocked = buildCategoryModel('armor').find((r) => r.recipeId === 'mod_std_dense');
    expect(blocked.canCraft).toBe(false);
    expect(blocked.status).toBe('missing-perk');

    seedStack('item_common_materials', 7);
    seedStack('item_uncommon_materials', 5);
    seedStack('item_rare_materials', 3);
    // ранг перка = число выбранных рангов (getPerkSelectionCount): 3 выбора = Бронник 3
    useCharacterStore.setState((prev) => ({
      selectedPerks: [
        ...(prev.selectedPerks || []),
        { perkId: 'armorer', index: 0 }, { perkId: 'armorer', index: 1 }, { perkId: 'armorer', index: 2 },
      ],
      // Ремонт 6: сложность 6 − 6 = 0 → автоуспех (броска нет, правило 323)
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));
    const ok = buildCategoryModel('armor').find((r) => r.recipeId === 'mod_std_dense');
    expect(ok.canCraft).toBe(true);

    const result = craftRecipe('mod_std_dense', {}, { deferTime: true });
    expect(result.done).toBe(true);
    expect(result.granted.itemId).toBe('mod_std_dense');
  });

  it('провал (осложнение) жжёт материалы — группа gear, настройка включена', () => {
    seedStack('item_common_materials', 3);
    const failed = craftRecipe('uniq_leather_boiled', { rollD20: () => 20 });
    expect(failed.stage).toBe('check');
    expect(failed.burned.length).toBeGreaterThan(0);
    expect(inventoryList().filter((i) => i.weaponId === 'item_common_materials').length).toBe(0);
  });
});
