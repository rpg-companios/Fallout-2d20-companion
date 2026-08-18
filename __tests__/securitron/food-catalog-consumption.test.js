import { afterEach, describe, expect, it, vi } from 'vitest';
import moduleFood from '../../modules/fallout/data/consumables/food.json';
import moduleChems from '../../modules/fallout/data/consumables/chems.json';
import ruFood from '../../modules/fallout/i18n/ru-RU/data/consumables/food.json';
import enFood from '../../modules/fallout/i18n/en-EN/data/consumables/food.json';
import {
  getInstantHealAmount,
  resolveConsumableVitalChanges,
  resolveConsumableRadiationAmount,
} from '../../domain/effects';
import { hasRadiationImmunity } from '../../domain/immunities';

afterEach(() => {
  vi.restoreAllMocks();
});

const byId = (items, id) => items.find((item) => item.id === id);

describe('каталог еды Fallout', () => {
  it('синхронизирует 75 записей механики с обеими локалями', () => {
    const dataIds = moduleFood.map((item) => item.id);

    expect(new Set(dataIds).size).toBe(75);
    expect(moduleFood.every((item) => (
      item.itemType === 'food'
      && ['raw', 'cooked'].includes(item.state)
      && typeof item.preserved === 'boolean'
      && item.positiveEffect?.hpModifier?.op === '+'
      && Number.isFinite(item.positiveEffect?.hpModifier?.value)
    ))).toBe(true);
    expect(ruFood.map((item) => item.id)).toEqual(dataIds);
    expect(enFood.map((item) => item.id)).toEqual(dataIds);
    expect(ruFood.every((item) => typeof item.name === 'string' && item.name.length > 0)).toBe(true);
    expect(enFood.every((item) => typeof item.name === 'string' && item.name.length > 0)).toBe(true);
  });

  it('хранит описания только в RU/EN-метаданных', () => {
    expect(moduleFood.every((item) => !Object.hasOwn(item, 'description'))).toBe(true);
    expect(ruFood.every((item) => typeof item.description === 'string')).toBe(true);
    expect(enFood.every((item) => typeof item.description === 'string')).toBe(true);
    expect(ruFood.filter((item) => item.description).length).toBe(23);
    expect(enFood.filter((item) => item.description).length).toBe(23);
    expect(byId(ruFood, 'food_mutant_hound_ribs').description).toBe('Лечит 2 урона от радиации');
    expect(byId(enFood, 'food_mutant_hound_ribs').description).toBe('Heals 2 radiation damage');
  });

  it('использует согласованные названия для гнуса и матки болотников', () => {
    expect(byId(ruFood, 'food_bloodbug_meat').name).toBe('Мясо гнуса');
    expect(byId(ruFood, 'food_bloodbug_steak').name).toBe('Стейк из гнуса');
    expect(byId(ruFood, 'food_mirelurk_queen_meat').name).toBe('Мясо матки болотников');
    expect(byId(ruFood, 'food_mirelurk_queen_steak').name).toBe('Стейк из матки болотников');
  });

  it('задаёт радиацию только структурированными бросками CD', () => {
    const irradiated = moduleFood.filter((item) => item.irradiated);
    const safe = moduleFood.filter((item) => !item.irradiated);

    expect(irradiated).toHaveLength(44);
    expect(safe).toHaveLength(31);
    expect(moduleFood.every((item) => !Object.hasOwn(item, 'radModifier'))).toBe(true);
    expect(safe.every((item) => item.radiationModifier === null)).toBe(true);
    expect(irradiated.every((item) => (
      item.radiationModifier?.op === '+'
      && item.radiationModifier?.rollType === 'rollCD'
      && [1, 2].includes(item.radiationModifier?.rollValue)
    ))).toBe(true);
    expect(byId(moduleFood, 'food_potted_meat').radiationModifier).toEqual({
      op: '+',
      rollType: 'rollCD',
      rollValue: 2,
    });
  });
});

describe('применение расходников движком', () => {
  it('читает лечение каждой еды из positiveEffect.hpModifier', () => {
    for (const item of moduleFood) {
      expect(getInstantHealAmount(item)).toBe(item.positiveEffect.hpModifier.value);
    }
  });

  it('суммирует стандартные значения граней CD: 1, 2, 0, 0, 1, 1', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.55)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.9);

    expect(resolveConsumableRadiationAmount({
      radiationModifier: { op: '+', rollType: 'rollCD', rollValue: 6 },
    })).toBe(5);
  });

  it('сначала лечит, затем напрямую увеличивает radiation без уменьшения текущих ОЗ', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // грань 2 => 2 радиации
      .mockReturnValueOnce(0.4); // грань 3 => 0 радиации

    const result = resolveConsumableVitalChanges(byId(moduleFood, 'food_potted_meat'), {
      currentHealth: 5,
      maxHealth: 10,
      radiation: 1,
      radiationResistance: 99,
    });

    expect(result).toEqual({
      healAmount: 6,
      healthAfter: 10,
      radiationAmount: 2,
      radiationAfter: 3,
    });
  });

  it('при врождённом иммунитете лечит, но не выполняет бросок радиации', () => {
    const random = vi.spyOn(Math, 'random');

    const result = resolveConsumableVitalChanges(byId(moduleFood, 'food_bloodbug_meat'), {
      currentHealth: 1,
      maxHealth: 10,
      radiation: 4,
      radiationImmune: hasRadiationImmunity({ origin: { immunities: ['radiation'] } }),
    });

    expect(result).toEqual({
      healAmount: 7,
      healthAfter: 8,
      radiationAmount: null,
      radiationAfter: 4,
    });
    expect(random).not.toHaveBeenCalled();
  });

  it('Антирадин снимает 4 очка радиации', () => {
    const result = resolveConsumableVitalChanges(byId(moduleChems, 'chem_radaway'), {
      currentHealth: 8,
      maxHealth: 10,
      radiation: 7,
    });

    expect(result).toEqual({
      healAmount: 0,
      healthAfter: 8,
      radiationAmount: -4,
      radiationAfter: 3,
    });
  });

  it('при нехватке радиации сообщает фактически снятое количество', () => {
    const result = resolveConsumableVitalChanges(byId(moduleChems, 'chem_radaway'), {
      currentHealth: 8,
      maxHealth: 10,
      radiation: 2,
    });

    expect(result.radiationAmount).toBe(-2);
    expect(result.radiationAfter).toBe(0);
  });

  it('при врождённом иммунитете Антирадин не меняет радиацию', () => {
    const result = resolveConsumableVitalChanges(byId(moduleChems, 'chem_radaway'), {
      currentHealth: 8,
      maxHealth: 10,
      radiation: 7,
      radiationImmune: true,
    });

    expect(result.radiationAmount).toBeNull();
    expect(result.radiationAfter).toBe(7);
  });

  it('отвергает устаревшие строковые radiationModifier вместо их нормализации', () => {
    expect(() => resolveConsumableRadiationAmount({ radiationModifier: 'rollCD' }))
      .toThrow('[effects] Некорректный radiationModifier расходника');
  });

  it('отвергает смешение фиксированного значения и броска', () => {
    expect(() => resolveConsumableRadiationAmount({
      radiationModifier: { op: '-', value: 4, rollType: 'rollCD', rollValue: 1 },
    })).toThrow('[effects] Некорректный radiationModifier расходника');
  });
});
