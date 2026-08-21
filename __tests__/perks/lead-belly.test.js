import { afterEach, describe, expect, it, vi } from 'vitest';
import moduleDrinks from '../../modules/fallout/data/consumables/drinks.json';
import moduleFood from '../../modules/fallout/data/consumables/food.json';
import { resolveConsumableVitalChanges, rollConsumableRadiation } from '../../domain/effects';
import { calculatePerkEffects } from '../../domain/perks';
import perksData from '../../modules/fallout/data/perks/perks.json';

afterEach(() => {
  vi.restoreAllMocks();
});

const byId = (items, id) => items.find((item) => item.id === id);
const leadBelly = perksData.find((perk) => perk.id === 'leadBelly');
const dirtyWater = byId(moduleDrinks, 'drink_dirty_water');
const rawMeat = byId(moduleFood, 'food_bloatfly_meat');

describe('leadBelly data', () => {
  it('gives dirty water a radiation CD roll without removing disease risk', () => {
    expect(dirtyWater.irradiated).toBe(true);
    expect(dirtyWater.radModifier).toEqual({
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
  it('rerolls one CD at rank 1 and skips irradiated radiation at rank 2', () => {
    const rank1 = calculatePerkEffects([leadBelly], [{ id: 'leadBelly', rank: 1 }]);
    const rank2 = calculatePerkEffects([leadBelly], [{ id: 'leadBelly', rank: 2 }]);
    expect(rank1.bonuses).toEqual({ irradiatedConsumableRadiationRerollIfDamage: 1 });
    expect(rank2.bonuses).toEqual({ irradiatedConsumableRadiationImmune: true });
  });
});

describe('leadBelly radiation rolls', () => {
  it('rerolls one contributing CD when the first roll dealt radiation', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // грань 2 => 2
      .mockReturnValueOnce(0.4); // переброс, грань 3 => 0

    expect(rollConsumableRadiation(rawMeat, { rerollOneIfDamage: 1 })).toBe(0);
  });

  it('does not reroll when the first roll dealt no radiation', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.4); // грань 3 => 0

    expect(rollConsumableRadiation(rawMeat, { rerollOneIfDamage: 1 })).toBe(0);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('skips the radiation roll for irradiated consumables at rank 2', () => {
    const random = vi.spyOn(Math, 'random');
    const result = resolveConsumableVitalChanges(dirtyWater, {
      currentHealth: 4,
      maxHealth: 10,
      radiation: 1,
      skipIrradiatedRadiation: true,
    });

    expect(result).toEqual({
      healAmount: 2,
      healthAfter: 6,
      radiationAmount: null,
      radiationAfter: 1,
    });
    expect(random).not.toHaveBeenCalled();
  });
});
