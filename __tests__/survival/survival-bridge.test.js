// Патчи 208–210 — слушатель расходников выживания (survivalConsumableListener),
// хранилище в зустанд-слайсе stateExtensions и гейт настройкой (этап 5):
// употребление еды/напитков ЛЮБЫМ путём (инвентарь или модалки) двигает
// шкалы одинаково, одним кодом; при выключенном выживании — заморожено.
// Операции читают свежее состояние прямо из стора.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { sleepSurvival, survivalConsumableListener } from '../../modules/fallout/survival/operations';
import { createSurvivalState, SURVIVAL_RULES } from '../../modules/fallout/survival/survival';
import food from '../../modules/fallout/data/consumables/food.json';
import drinks from '../../modules/fallout/data/consumables/drinks.json';

const steak = food.find((entry) => entry.id === 'food_bloodbug_steak') || food[0];
const rawMeat = food.find((entry) => entry.id === 'food_bloatfly_meat') || food[1];
const soupEntry = food.find((entry) => entry.id === 'food_vegetable_soup') || food[2];
const purified = drinks.find((entry) => entry.id === 'drink_purified_water') || drinks[0];
const dirty = drinks.find((entry) => entry.id === 'drink_dirty_water') || drinks[1];

// Контекст для слушателя: пишет через действие стора (как контекст движка).
const ctx = () => ({
  setStateExtension: useCharacterStore.getState().setStateExtension,
});

const storeSurvival = () => useCharacterStore.getState().stateExtensions?.survival ?? null;
const setStoreSurvival = (survival) => {
  useCharacterStore.getState().setStateExtensions({ survival });
};

const setSurvivalEnabled = (value) => {
  useAppSettingsStore.getState().setValue('survivalModeEnabled', value);
};

beforeEach(() => {
  setSurvivalEnabled(true); // операторы выживания тестируем на включённой системе
});

afterEach(() => {
  useCharacterStore.getState().setStateExtensions({});
  setSurvivalEnabled(false); // дефолт настройки
});

describe('survivalConsumableListener: еда и напитки двигают шкалы (через стор)', () => {
  it('готовый стейк: +2 еды, вода не трогается', () => {
    const start = createSurvivalState('human');
    start.food = 1;
    start.water = 1;
    setStoreSurvival(start);
    const result = survivalConsumableListener(steak, ctx());
    expect(result).toMatchObject({ ok: true, gained: { food: 2, water: 0 } });
    expect(storeSurvival().food).toBe(3);
    expect(storeSurvival().water).toBe(1);
  });

  it('суп: +1 еды и +1 воды (данные soup)', () => {
    const start = createSurvivalState('human');
    start.food = 1;
    start.water = 1;
    setStoreSurvival(start);
    const result = survivalConsumableListener(soupEntry, ctx());
    expect(result).toMatchObject({ ok: true, gained: { food: 1, water: 1 } });
    expect(storeSurvival().food).toBe(2);
    expect(storeSurvival().water).toBe(2);
  });

  it('очищенная вода: +2 воды; грязная: +1', () => {
    const start = createSurvivalState('human');
    start.water = 1;
    setStoreSurvival(start);
    const purifiedResult = survivalConsumableListener(purified, ctx());
    expect(purifiedResult).toMatchObject({ ok: true, gained: { food: 0, water: 2 } });
    expect(storeSurvival().water).toBe(3);

    const second = createSurvivalState('human');
    second.water = 2;
    setStoreSurvival(second);
    const dirtyResult = survivalConsumableListener(dirty, ctx());
    expect(dirtyResult).toMatchObject({ ok: true, gained: { food: 0, water: 1 } });
    expect(storeSurvival().water).toBe(3);
  });

  it('еда на максимуме: ok:false, состояние не меняется', () => {
    const start = createSurvivalState('human');
    start.food = SURVIVAL_RULES.max.food;
    setStoreSurvival(start);
    const result = survivalConsumableListener(steak, ctx());
    expect(result).toEqual({ ok: false, reason: 'full' });
    expect(storeSurvival().food).toBe(SURVIVAL_RULES.max.food);
  });

  it('вода на максимуме: ок, шкала не двигается, подъём 0', () => {
    const start = createSurvivalState('human');
    start.water = SURVIVAL_RULES.max.water;
    setStoreSurvival(start);
    const result = survivalConsumableListener(purified, ctx());
    expect(result).toMatchObject({ ok: true, gained: { food: 0, water: 0 } });
    expect(storeSurvival().water).toBe(SURVIVAL_RULES.max.water);
  });

  it('сырое мясо — тоже еда: +1 (признак state)', () => {
    const start = createSurvivalState('human');
    start.food = 1;
    setStoreSurvival(start);
    const result = survivalConsumableListener(rawMeat, ctx());
    expect(result).toMatchObject({ ok: true, gained: { food: 1, water: 0 } });
    expect(storeSurvival().food).toBe(2);
  });

  it('не еда/не напиток — null; нет выживания (робот) — null', () => {
    setStoreSurvival(createSurvivalState('human'));
    expect(survivalConsumableListener({ itemType: 'chem', id: 'chem_mentats' }, ctx())).toBeNull();

    setStoreSurvival(null);
    expect(survivalConsumableListener(steak, ctx())).toBeNull();
    expect(survivalConsumableListener(purified, ctx())).toBeNull();
  });

  it('два употребления подряд читают свежее состояние стора', () => {
    const start = createSurvivalState('human');
    start.food = 1;
    setStoreSurvival(start);
    survivalConsumableListener(steak, ctx()); // 1 → 3
    const second = survivalConsumableListener(steak, ctx()); // 3 → 5
    expect(second).toMatchObject({ ok: true, gained: { food: 2, water: 0 } });
    expect(storeSurvival().food).toBe(5);
  });
});

describe('survival: гейт настройкой survivalModeEnabled (этап 5)', () => {
  it('выключено — слушатель заморожен: null, шкала не двигается', () => {
    const start = createSurvivalState('human');
    start.food = 1;
    setStoreSurvival(start);
    setSurvivalEnabled(false);
    expect(survivalConsumableListener(steak, ctx())).toBeNull();
    expect(storeSurvival().food).toBe(1);
  });

  it('включено — слушатель снова работает', () => {
    const start = createSurvivalState('human');
    start.food = 1;
    setStoreSurvival(start);
    setSurvivalEnabled(false);
    setSurvivalEnabled(true);
    const result = survivalConsumableListener(steak, ctx());
    expect(result).toMatchObject({ ok: true, gained: { food: 2, water: 0 } });
    expect(storeSurvival().food).toBe(3);
  });

  it('выключено — сон не применяется (reason disabled), состояние не трогается', () => {
    const start = createSurvivalState('human');
    start.sleep = 2;
    setStoreSurvival(start);
    setSurvivalEnabled(false);
    const result = sleepSurvival(
      {
        setStateExtension: useCharacterStore.getState().setStateExtension,
        currentHealth: 20,
        setCurrentHealth: () => {},
        advanceEffectsByGameHours: () => ({ effects: [], expired: [] }),
        resolveSceneRiskEventById: () => null,
      },
      { place: 'bed', hours: 8 },
    );
    expect(result).toEqual({ ok: false, reason: 'disabled' });
    expect(storeSurvival().sleep).toBe(2);
  });
});

describe('sleepSurvival: сон применяется к слайсу стора', () => {
  it('8 часов в кровати: sleep 5, бонус +2, ОЗ обновляется', () => {
    const start = createSurvivalState('human');
    start.sleep = 2;
    setStoreSurvival(start);
    const hpApplied = [];
    const result = sleepSurvival(
      {
        setStateExtension: useCharacterStore.getState().setStateExtension,
        currentHealth: 20,
        setCurrentHealth: (hp) => hpApplied.push(hp),
        advanceEffectsByGameHours: () => ({ effects: [], expired: [] }),
        resolveSceneRiskEventById: () => null,
      },
      { place: 'bed', hours: 8 },
    );
    expect(result.ok).toBe(true);
    expect(storeSurvival().sleep).toBe(5);
    expect(storeSurvival().hpBonus).toBe(SURVIVAL_RULES.sleep.hpBonus);
    expect(result.diseaseRiskResult).toBeNull(); // кровать — без проверки болезни
    expect(hpApplied).toEqual([20]);
  });

  it('сон в пустоши — проверка болезни', () => {
    const start = createSurvivalState('human');
    setStoreSurvival(start);
    const disease = { status: 'passed' };
    const result = sleepSurvival(
      {
        setStateExtension: useCharacterStore.getState().setStateExtension,
        currentHealth: 10,
        setCurrentHealth: () => {},
        advanceEffectsByGameHours: () => ({ effects: [], expired: [] }),
        resolveSceneRiskEventById: () => disease,
      },
      { place: 'wasteland', hours: 4 },
    );
    expect(result.ok).toBe(true);
    expect(result.diseaseRiskResult).toBe(disease);
    // пустошь: потолок «отдохнувший», бонуса нет
    expect(storeSurvival().hpBonus).toBe(0);
  });
});
