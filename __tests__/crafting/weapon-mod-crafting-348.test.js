// ПРИЁМОЧНЫЙ (патч 348): крафт модов ОРУЖИЯ — квадрат «Оружие» жив.
//   • 105 рецепта из колонок каталога weapon_mods.json (аудит печатных
//     таблиц, решения владельца 346/347: выпускаем все с колонками, включая
//     уникальные; конденсаторы — как есть);
//   • проверка — ИНТ + навык (Ремонт/Наука!), сложность из колонки;
//   • перковый гейт («Фанатик оружия», «Наука!», «Кузнец») как у остальных;
//   • верстак оружия материалы НЕ жжёт (как брони, правило 323/270);
//   • созданный мод — предмет в сумке: тип weaponMod, каталожное имя,
//     привязка при установке — по закону владельца 343/344.
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

describe('Крафт модов оружия (348): квадрат «Оружие», проверка, мод в сумке', () => {
  it('квадрат «Оружие»: 105 рецепта из колонок каталога; верстак не жжёт', () => {
    const tiles = buildCraftTiles();
    const weapons = tiles.find((t) => t.category === 'weapons');
    expect(weapons.recipes).toBe(105);
    expect(buildCategoryModel('weapons').length).toBe(105);
    // правило верстака оружия (как у брони): провал не сжигает материалы
    expect(getCraftingCategoryRules('weapons').failBurnsMaterialsSkills).toEqual([]);
  });

  it('«Скорострельный» (сложность 3, Фанатик оружия 1): успешен, мод-предмет в сумке', () => {
    const recipe = getCraftingRecipeById('mod_rapid');
    expect(recipe.requires).toEqual({
      skill: 'REPAIR',
      complexity: 3,
      perks: [{ perkId: 'gunNut', rank: 1 }],
    });
    expect(recipe.materials).toEqual([
      { itemId: 'item_common_materials', count: 4 },
      { itemId: 'item_uncommon_materials', count: 2 },
    ]);

    // перковый гейт: без Фанатика оружия рецепт заблокирован
    const blocked = buildCategoryModel('weapons').find((r) => r.recipeId === 'mod_rapid');
    expect(blocked.status).toBe('missing-perk');

    seedStack('item_common_materials', 4);
    seedStack('item_uncommon_materials', 2);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));

    const result = craftRecipe('mod_rapid', { rollD20: () => 3 }, { deferTime: true });
    expect(result.done).toBe(true);
    expect(result.granted.itemId).toBe('mod_rapid');

    // мод в сумке: тип weaponMod, каталожное имя, обычный предмет инвентаря
    const catalog = getEquipmentCatalog('en-EN');
    const inBag = inventoryList().find((i) => i.weaponId === 'mod_rapid' && !i.installedOn);
    expect(inBag).toBeTruthy();
    expect(inBag.itemType).toBe('weaponMod');
    expect(findCatalogEntry(catalog, 'mod_rapid', 'weaponMod')?.name).toBe('Rapid');
  });

  it('конденсаторы: пара перков книги (Фанатик 3 + Наука! 2), навык из колонки', () => {
    const recipe = getCraftingRecipeById('mod_full_capacitors');
    expect(recipe.requires.skill).toBe('REPAIR'); // конденсаторы оставлены как есть (347)
    expect(recipe.requires.complexity).toBe(5);
    expect(recipe.requires.perks).toEqual([
      { perkId: 'gunNut', rank: 3 },
      { perkId: 'science', rank: 2 },
    ]);

    seedStack('item_common_materials', 6);
    seedStack('item_uncommon_materials', 4);
    seedStack('item_rare_materials', 2);
    useCharacterStore.setState({
      selectedPerks: [
        { perkId: 'gunNut', index: 0 }, { perkId: 'gunNut', index: 1 }, { perkId: 'gunNut', index: 2 },
        { perkId: 'science', index: 0 }, { perkId: 'science', index: 1 },
      ],
    });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));

    const result = craftRecipe('mod_full_capacitors', { rollD20: () => 2 }, { deferTime: true });
    expect(result.done).toBe(true);
    expect(result.granted.itemId).toBe('mod_full_capacitors');
    const inBag = inventoryList().find((i) => i.weaponId === 'mod_full_capacitors' && !i.installedOn);
    expect(inBag?.itemType).toBe('weaponMod');
  });

  it('наукоёмкий мод (прицел): навык Наука! из колонки работает так же', () => {
    const recipe = getCraftingRecipeById('mod_photon_exciter');
    expect(recipe.requires).toEqual({
      skill: 'SCIENCE',
      complexity: 3,
      perks: [{ perkId: 'science', rank: 1 }],
    });

    seedStack('item_common_materials', 4);
    seedStack('item_uncommon_materials', 2);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'science', index: 0 }] });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, SCIENCE: { ...(prev.skills?.SCIENCE ?? {}), base: 6, total: 6 } },
    }));

    const result = craftRecipe('mod_photon_exciter', { rollD20: () => 4 }, { deferTime: true });
    expect(result.done).toBe(true);
    const inBag = inventoryList().find((i) => i.weaponId === 'mod_photon_exciter' && !i.installedOn);
    expect(inBag?.itemType).toBe('weaponMod');
  });

  it('провал жжёт материалы по правилу gear (настройка 323, как у модов брони)', () => {
    seedStack('item_common_materials', 4);
    seedStack('item_uncommon_materials', 2);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
    // ранг 0 против сложности 3 + провал на броске → крафт не удался
    const failed = craftRecipe('mod_rapid', { rollD20: () => 20 });
    expect(failed.stage).toBe('check');
    expect(failed.burned.length).toBeGreaterThan(0);
  });

  it('моды без колонок крафта в рецептов не попадали (36 шт., их нет в книге)', () => {
    const weaponMods = getEquipmentCatalog('en-EN').weaponMods || [];
    const withColumns = weaponMods.filter((m) => m.complexity != null).length;
    expect(withColumns).toBeGreaterThanOrEqual(105);
    const crafted = new Set(buildCategoryModel('weapons').map((r) => r.recipeId));
    for (const mod of weaponMods) {
      if (mod.complexity == null) expect(crafted.has(mod.id)).toBe(false);
    }
  });
});
