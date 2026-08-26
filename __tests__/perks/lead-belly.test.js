import { afterEach, describe, expect, it, vi } from 'vitest';
import moduleDrinks from '../../modules/fallout/data/consumables/drinks.json';
import moduleFood from '../../modules/fallout/data/consumables/food.json';
import {
  rerollConsumableRadiationRoll,
  resolveConsumableRadiationRoll,
  resolveConsumableVitalChanges,
} from '../../domain/effects';
import { calculatePerkEffects } from '../../domain/perks';
import perksData from '../../modules/fallout/data/perks/perks.json';

afterEach(() => {
  vi.restoreAllMocks();
});

const dirtyWater = moduleDrinks.find((item) => item.id === 'drink_dirty_water');
const rawMeat = moduleFood.find((item) => item.irradiated && item.radiationModifier?.rollValue === 1);
const leadBelly = perksData.find((perk) => perk.id === 'leadBelly');

describe('leadBelly data', () => {
  it('gives dirty water a radiation CD roll without removing disease risk', () => {
    expect(dirtyWater.irradiated).toBe(true);
    expect(dirtyWater.radiationModifier).toEqual({
      op: '+',
      rollType: 'rollCD',
      rollValue: 1,
    });
    expect(dirtyWater.sceneRiskEvents).toEqual([
      { ruleId: 'diseaseExposure', eventId: 'dirtyWater' },
    ]);
  });
});

describe('leadBelly bonuses', () => {
  it('offers a reroll at rank 1 and skips irradiated radiation at rank 2', () => {
    const rank1 = calculatePerkEffects([leadBelly], [{ id: 'leadBelly', rank: 1 }]);
    const rank2 = calculatePerkEffects([leadBelly], [{ id: 'leadBelly', rank: 2 }]);
    expect(rank1.bonuses).toEqual({ irradiatedConsumableRadiationRerollIfDamage: 1 });
    expect(rank2.bonuses).toEqual({ irradiatedConsumableRadiationImmune: true });
  });
});

describe('leadBelly radiation rolls', () => {
  it('keeps the first roll until a reroll is requested', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2); // грань 2 => 2

    const first = resolveConsumableRadiationRoll(rawMeat);
    expect(first.requestedAmount).toBe(2);
    expect(first.rolls).toEqual([2]);
  });

  it('replaces one contributing CD when the player accepts the reroll', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // первый бросок: 2
      .mockReturnValueOnce(0.4); // переброс: 0

    const first = resolveConsumableRadiationRoll(rawMeat);
    const rerolled = rerollConsumableRadiationRoll(rawMeat, first.rolls);
    expect(first.requestedAmount).toBe(2);
    expect(rerolled.requestedAmount).toBe(0);
  });

  it('skips the radiation roll for irradiated consumables at rank 2', () => {
    const random = vi.spyOn(Math, 'random');
    const result = resolveConsumableVitalChanges(dirtyWater, {
      currentHealth: 4,
      maxHealth: 10,
      radiation: 1,
      skipIrradiatedRadiation: true,
    });

    expect(result.healAmount).toBe(2);
    expect(result.healthAfter).toBe(6);
    expect(result.radiationAmount).toBe(null);
    expect(result.radiationAfter).toBe(1);
    expect(random).not.toHaveBeenCalled();
  });
});
