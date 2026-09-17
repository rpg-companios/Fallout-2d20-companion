// Патч 262: время разбора и крафта привязано к часам выживания.
// Проверка трёх контуров: чистая операция applyActivityMinutes (лестницы,
// перенос дроби, гейты), подключение её к операциям крафта и разбора
// (время тратится на успехе и на сорванной работе, не тратится на отказах),
// и числовая устойчивость: мост эффектов обязан выдерживать дробные часы.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { legacyEffectToStore } from '../../src/store/effectsSync';
import { applyActivityMinutes } from '../../modules/fallout/survival/operations';
import { createSurvivalState } from '../../modules/fallout/survival/survival';
import { craftRecipe, craftMinutesForRecipe } from '../../modules/fallout/crafting/operations';
import { salvageItem } from '../../modules/fallout/salvage/operations';
import { getItemId } from '../../domain/itemIdentity';

const state = () => useCharacterStore.getState();
const storeSurvival = () => state().stateExtensions?.survival ?? null;
const setSurvivalEnabled = (value) => {
  useAppSettingsStore.getState().setValue('survivalModeEnabled', value);
};

const give = (itemId, quantity = 1) => state().addNewItem({ itemId, quantity });
const countOf = (itemId) => Object.values(state().items)
  .reduce((sum, item) => (getItemId(item) === itemId ? sum + (Number(item.quantity) || 1) : sum), 0);

const seedHuman = (patch = {}) => {
  const start = createSurvivalState('human');
  Object.assign(start, patch);
  state().setStateExtensions({ survival: start });
  return start;
};

beforeEach(() => {
  state().resetCharacterStore();
  setSurvivalEnabled(true);
});

afterEach(async () => {
  state().setStateExtensions({});
  state().resetCharacterStore();
  setSurvivalEnabled(false);
  await useCharacterStore.persist.clearStorage();
});

describe('applyActivityMinutes: работа идёт по часам', () => {
  it('час работы: лестницы тикают как на контуре реального времени', () => {
    seedHuman();
    const result = applyActivityMinutes(60, 'test');
    expect(result).toMatchObject({ applied: true, minutes: 60, gameHours: 1 });
    const survival = storeSurvival();
    expect(survival.food).toBe(4); // 5 → 4 на первом же часу
    expect(survival.water).toBe(3); // 4 → 3 тоже (порог 1 ч)
    expect(survival.sleep).toBe(5); // сон шагает раз в 8 часов
    expect(survival.timeCarried).toBeCloseTo(0, 10);
  });

  it('дробь переносится: шесть дел по 10 минут складываются ровно в час', () => {
    // Float-ловушка, из-за которой и нужен допуск в advanceHours:
    // 6 × (10/60) = 0.9999999999999999 — без допуска час не тикает никогда.
    seedHuman();
    for (let i = 0; i < 5; i += 1) {
      applyActivityMinutes(10, 'test');
      expect(storeSurvival().food).toBe(5); // шагов ещё нет
    }
    expect(storeSurvival().timeCarried).toBeCloseTo(5 / 6, 10);
    applyActivityMinutes(10, 'test');
    expect(storeSurvival().food).toBe(4);
    expect(storeSurvival().water).toBe(3);
  });

  it('гейты: выключенное выживание заморожено, робот без шкал не считается', () => {
    const start = seedHuman();
    setSurvivalEnabled(false);
    expect(applyActivityMinutes(120, 'test')).toMatchObject({ applied: false, reason: 'disabled' });
    setSurvivalEnabled(true);
    state().setStateExtensions({}); // шкал нет (робот/киборг)
    expect(applyActivityMinutes(120, 'test')).toMatchObject({ applied: false, reason: 'notCapable' });
    // состояние не сдвинулось ни на йоту
    expect(storeSurvival()).toBeNull();
    state().setStateExtensions({ survival: start });
    expect(storeSurvival().food).toBe(5);
  });

  it('ноль и дурные минуты — отказ без последствий', () => {
    seedHuman();
    expect(applyActivityMinutes(0)).toMatchObject({ applied: false, reason: 'nothing-to-spend' });
    expect(applyActivityMinutes(Number.NaN)).toMatchObject({ applied: false, reason: 'nothing-to-spend' });
    expect(storeSurvival().timeCarried).toBe(0);
  });

  it('дробные часы не ломают мост эффектов: 10 минут = ровно 2 сцены', () => {
    // Без округления в сторе (патч 262) 1/6 ч × 12 дали бы 1.999… и домен
    // бросал бы на нецелом числе сцен. Истечение — по дедлайну, не по сумме
    // шагов, поэтому проверяем один проход: короткий эффект погас, длинный нет.
    seedHuman();
    useCharacterStore.setState({
      effects: {
        e1: legacyEffectToStore({ id: 'e1', effectName: 'Рад', effectKind: 'negative', scenesLeft: 1 }),
        e2: legacyEffectToStore({ id: 'e2', effectName: 'Леч', effectKind: 'positive', scenesLeft: 5 }),
      },
    });
    const result = applyActivityMinutes(10, 'test');
    expect(result.expired.map((e) => e.id)).toEqual(['e1']);
    expect(state().effects.e1.active).toBe(false);
    expect(state().effects.e2.active).not.toBe(false);
  });
});

describe('ступени длительности крафта', () => {
  it('10 минут / час / сутки по печатной Complexity рецепта', () => {
    const at = (complexity) => craftMinutesForRecipe({ requires: { complexity } });
    expect(at(0)).toBe(10);
    expect(at(1)).toBe(10);
    expect(at(2)).toBe(60);
    expect(at(3)).toBe(60);
    expect(at(4)).toBe(1440);
    expect(at(7)).toBe(1440);
  });
});

describe('крафт тратит время', () => {
  const grill = 'food_grilled_bloatfly'; // cooking, Complexity 1, навык SURVIVAL

  it('автоуспех (сложность 0 после навыка): +10 минут, время в ответе', () => {
    seedHuman();
    give('food_bloatfly_meat', 2);
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, SURVIVAL: { ...(prev.skills?.SURVIVAL ?? {}), base: 1, total: 1 } },
    }));
    const result = craftRecipe(grill);
    expect(result.done).toBe(true);
    expect(result.auto).toBe(true);
    expect(result.time).toEqual({ minutes: 10, durationMultiplier: 1 });
    expect(result.survival).toMatchObject({ applied: true, minutes: 10 });
    expect(storeSurvival().timeCarried).toBeCloseTo(1 / 6, 10);
  });

  it('сорванная работа тоже идёт по часам: провал с осложнением — 20 минут, материалы сгорают', () => {
    seedHuman();
    give('food_bloatfly_meat', 2);
    const meatBefore = countOf('food_bloatfly_meat');
    const result = craftRecipe(grill, { rollD20: () => 20 }); // 20 = осложнение, два = автопровал; ×2
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.time).toEqual({ minutes: 10, durationMultiplier: 2 });
    expect(result.survival).toMatchObject({ applied: true, minutes: 20 });
    expect(storeSurvival().timeCarried).toBeCloseTo(20 / 60, 10);
    // кухня/химия: провал сжигает материалы (251) — время честно потрачено на пепел
    expect(countOf('food_bloatfly_meat')).toBe(meatBefore - 2);
  });

  it('отказ гейта (нет материалов) — ни минут', () => {
    seedHuman();
    const result = craftRecipe(grill);
    expect(result.done).toBe(false);
    expect(result.stage).toBe('gate');
    expect(result.time).toBeUndefined();
    expect(result.survival).toBeUndefined();
    expect(storeSurvival().timeCarried).toBe(0);
    expect(storeSurvival().food).toBe(5);
  });

  it('выключенные часы выживания: время в ответе есть, лестницы заморожены', () => {
    seedHuman();
    give('food_bloatfly_meat', 2);
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, SURVIVAL: { ...(prev.skills?.SURVIVAL ?? {}), base: 1, total: 1 } },
    }));
    setSurvivalEnabled(false);
    const result = craftRecipe(grill);
    expect(result.done).toBe(true);
    expect(result.time.minutes).toBe(10);
    expect(result.survival).toMatchObject({ applied: false, reason: 'disabled' });
  });
});

describe('разбор тратит время', () => {
  it('успешный разбор желёзы: +10 минут в часы выживания', () => {
    seedHuman();
    const result = salvageItem(give('bloatfly_gland'), { rollD20: () => 3, choose: (n) => n });
    expect(result.done).toBe(true);
    expect(result.survival).toMatchObject({ applied: true, minutes: 10, cause: 'salvage' });
    expect(storeSurvival().timeCarried).toBeCloseTo(1 / 6, 10);
  });

  it('провал с осложнением: предмет цел, вечер потерян — 20 минут', () => {
    seedHuman();
    const instanceId = give('bloatfly_gland');
    const result = salvageItem(instanceId, { rollD20: () => 20 });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(countOf('bloatfly_gland')).toBe(1);
    expect(result.time).toEqual({ minutes: 10, durationMultiplier: 2 });
    expect(result.survival).toMatchObject({ applied: true, minutes: 20 });
  });

  it('гейт-отказ (не хлам) кубиков не видит — время не тратится', () => {
    seedHuman();
    const result = salvageItem(give('weapon_baseball_bat', 2), { rollD20: () => 3 });
    expect(result.reason).toBe('not-salvageable');
    expect(result.survival).toBeUndefined();
    expect(storeSurvival().timeCarried).toBe(0);
  });

  it('шесть разборов кряду = час: лестницы сдвигаются на шестом', () => {
    seedHuman();
    for (let i = 0; i < 5; i += 1) {
      const result = salvageItem(give('bloatfly_gland'), { rollD20: () => 3, choose: (n) => n });
      expect(result.survival).toMatchObject({ applied: true });
      expect(storeSurvival().food).toBe(5);
      expect(storeSurvival().timeCarried).toBeCloseTo((i + 1) / 6, 10);
    }
    salvageItem(give('bloatfly_gland'), { rollD20: () => 3, choose: (n) => n });
    expect(storeSurvival().food).toBe(4);
    expect(storeSurvival().water).toBe(3);
  });
});
