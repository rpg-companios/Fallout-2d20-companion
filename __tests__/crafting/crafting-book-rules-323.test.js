// ПРИЁМОЧНЫЙ (патч 323): крафт по печатным правилам (текст книги от владельца).
//   • проверка — ИНТ + навык; сложность = сложность рецепта − ранг (мин. 0);
//     0 — проверки нет (автоуспех) [движок 251, не менялся];
//   • время: час всем категориям, станция приготовления пищи (еда/напитки) —
//     20 минут; ступени 259 отменены;
//   • каждое осложнение: +30 минут (станция +10) — аддитивно, не множителем;
//   • успех — можно сократить время вдвое, потратив 2 ОД (выбор да/нет в окне);
//   • потеря материалов при провале — настройка раздела «Крафт», две группы:
//     consumables (еда, напитки, взрывчатка, препараты) и gear (броня, оружие,
//     патроны и прочее).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { CRAFT_RULES } from '../../modules/fallout/crafting/rules';
import {
  craftMinutesForRecipe,
  complicationExtraMinutesFor,
  craftRecipe,
  settleCraftTime,
} from '../../modules/fallout/crafting/operations';
import { getCraftingRecipeById } from '../../domain/registry';

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

// еда: без перков, материалы — 2× food_bloatfly_meat (станция, 20 мин)
const FOOD = 'food_grilled_bloatfly';
// патроны: перковый гейт ammosmith (потери — группа gear)
const AMMO = 'ammo_38';

describe('Крафт по книге (323): времена, осложнения, ОД, потеря материалов', () => {
  it('время: час всем, еда/напитки — 20 минут (станция)', () => {
    expect(CRAFT_RULES.craftBaseMinutes).toBe(60);
    expect(CRAFT_RULES.stationMinutes).toBe(20);
    expect(craftMinutesForRecipe(getCraftingRecipeById(FOOD))).toBe(20);
    expect(craftMinutesForRecipe(getCraftingRecipeById(AMMO))).toBe(60);
    expect(CRAFT_RULES.craftTimeTiers).toBeUndefined(); // ступени 259 отменены
    expect(CRAFT_RULES.complicationDurationMultiplier).toBeUndefined();
  });

  it('осложнение аддитивно: +30 минут, на станции +10', () => {
    expect(CRAFT_RULES.complicationExtraMinutes).toBe(30);
    expect(CRAFT_RULES.stationComplicationExtraMinutes).toBe(10);
    expect(complicationExtraMinutesFor(getCraftingRecipeById(FOOD))).toBe(10);
    expect(complicationExtraMinutesFor(getCraftingRecipeById(AMMO))).toBe(30);
  });

  it('отложенное время: throw гейта не списывает часы; успех+осложнение = база+30', () => {
    seedStack('item_common_materials', 4);
    useCharacterStore.setState((prev) => ({
      selectedPerks: [...(prev.selectedPerks || []), { perkId: 'ammosmith', index: 0 }],
      // навык 0: сложность 1 − 0 = 1 → бросок БЫВАЕТ (при ранге 5+ была бы автоуспех)
    }));
    // успех с осложнением: выпало 3 (успех при ИНТ+навык=4) и 20 (осложнение)
    const result = craftRecipe(AMMO, { rollD20: (() => { let i = 0; return () => [3, 20][i++ % 2]; })() }, { deferTime: true });
    expect(result.done).toBe(true);
    expect(result.time.pending).toBe(true);
    expect(result.time.baseMinutes).toBe(60);
    expect(result.time.complicationMinutes).toBe(30);
    expect(result.time.minutes).toBe(90);
    expect(result.survival).toBeUndefined(); // часы ещё не тронуты

    // решение «нет» — полное время; «да» — успех вдвое, осложнение поверх
    const run = { attempts: [result] };
    expect(settleCraftTime(AMMO, run, { spendActionPoints: false }).minutes).toBe(90);
    const second = craftRecipe(AMMO, { rollD20: () => 3 }, { deferTime: true }); // авто... нет: бросок 3 — успех без осложнений
    expect(settleCraftTime(AMMO, { attempts: [result, second] }, { spendActionPoints: true }).minutes)
      .toBe(30 + 30 + (60 / 2)); // провал? нет: оба успешны → (60/2+30) + (60/2)
  });

  it('потеря материалов при провале — две настройки раздела «Крафт»', () => {
    // еда (consumables): провал → материалы сгорают (настройка включена)
    seedStack('food_bloatfly_meat', 2);
    const failFood = craftRecipe(FOOD, { rollD20: () => 20 });
    expect(failFood.stage).toBe('check');
    expect(failFood.burned.length).toBeGreaterThan(0);

    // выключили группу consumables — еда при провале материалы сохраняет
    useAppSettingsStore.getState().setValue('craftFailLossConsumables', false);
    seedStack('food_bloatfly_meat', 2);
    const savedFood = craftRecipe(FOOD, { rollD20: () => 20 });
    expect(savedFood.stage).toBe('check');
    expect(savedFood.burned.length).toBe(0);

    // патроны (gear): настройка OFF → при провале материалы целы
    useAppSettingsStore.getState().setValue('craftFailLossGear', false);
    seedStack('item_common_materials', 4);
    useCharacterStore.setState((prev) => ({
      selectedPerks: [...(prev.selectedPerks || []), { perkId: 'ammosmith', index: 0 }],
    }));
    const savedAmmo = craftRecipe(AMMO, { rollD20: () => 20 });
    expect(savedAmmo.stage).toBe('check');
    expect(savedAmmo.burned.length).toBe(0);
    // и снова ON — горят
    useAppSettingsStore.getState().setValue('craftFailLossGear', true);
    seedStack('item_common_materials', 4);
    const burnedAmmo = craftRecipe(AMMO, { rollD20: () => 20 });
    expect(burnedAmmo.burned.length).toBeGreaterThan(0);
  });

  it('настройки существуют в каталоге и переведены (раздел «Крафт»)', () => {
    const ru = require('../../modules/fallout/i18n/ru-RU/data/system/settings.json');
    const en = require('../../modules/fallout/i18n/en-EN/data/system/settings.json');
    expect(ru.crafting).toBe('Крафт');
    expect(en.crafting).toBe('Crafting');
    for (const key of ['craftLossConsumablesTitle', 'craftLossGearTitle',
      'craftLossConsumablesDescription', 'craftLossGearDescription']) {
      expect(String(ru[key]).length).toBeGreaterThan(0);
      expect(String(en[key]).length).toBeGreaterThan(0);
    }
  });
});
