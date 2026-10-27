import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAddiction, resolveConsumableVitalChanges } from '../../domain/effects';
import { pickRandomItem, rollFoundItemBonuses, sumFoundItemBonus } from '../../domain/foundItemBonus';
import { calculatePerkEffects } from '../../domain/perks';
import { COLA_NUT_DRINK_IDS } from '../../domain/perks/colaNut';
import { DIRTY_WATER_ID } from '../../domain/perks/thirstQuencher';
import perksData from '../../modules/fallout/data/perks/perks.json';
import drinks from '../../modules/fallout/data/consumables/drinks.json';

afterEach(() => {
  vi.restoreAllMocks();
});

const byId = (id) => perksData.find((perk) => perk.id === id);
const drinkById = (id) => drinks.find((item) => item.id === id);

const getHeal = (item) => {
  const pe = item.positiveEffect;
  if (pe && typeof pe === 'object' && pe.hpModifier?.op === '+') return Number(pe.hpModifier.value) || 0;
  return Number(item.hpHealed) || 0;
};

describe('chemResistant', () => {
  it('penalizes addiction dice at rank 1 and grants immunity at rank 2', () => {
    const rank1 = calculatePerkEffects([byId('chemResistant')], [{ id: 'chemResistant', rank: 1 }]);
    const rank2 = calculatePerkEffects([byId('chemResistant')], [{ id: 'chemResistant', rank: 2 }]);
    expect(rank1.bonuses).toEqual({ chemAddictionDicePenalty: 1 });
    expect(rank2.bonuses).toEqual({ chemAddictionImmune: true });
  });

  it('rolls one fewer combat die', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const item = { addictionLevel: 1, negativeEffect: 'addiction' };
    checkAddiction(item, 2, { dicePenalty: 1 });
    expect(random).toHaveBeenCalledTimes(1);
  });
});

describe('colaNut', () => {
  it('binds to the three Nuka-Cola ids', () => {
    const result = calculatePerkEffects([byId('colaNut')], [{ id: 'colaNut', rank: 1 }]);
    expect(result.bonuses.colaNutDrinkIds).toEqual(COLA_NUT_DRINK_IDS);
    expect(result.bonuses.colaNutHealMultiplier).toBe(2);
    expect(COLA_NUT_DRINK_IDS).toEqual([
      'drink_nuka_cola',
      'drink_nuka_cherry',
      'drink_nuka_cola_quantum',
    ]);
  });

  it('doubles instant healing for a bound drink', () => {
    const nuka = drinkById('drink_nuka_cherry');
    const result = resolveConsumableVitalChanges(nuka, {
      currentHealth: 1,
      maxHealth: 20,
      radiation: 0,
      hpHealMultiplier: 2,
    });
    expect(result.healAmount).toBe(getHeal(nuka) * 2);
  });
});

describe('thirstQuencher', () => {
  it('flags dirty water disease skip', () => {
    const result = calculatePerkEffects([byId('thirstQuencher')], [{ id: 'thirstQuencher', rank: 1 }]);
    expect(result.bonuses).toEqual({ dirtyWaterDiseaseImmune: true });
    expect(DIRTY_WATER_ID).toBe('drink_dirty_water');
  });
});

describe('pharmaFarmer', () => {
  it('adds one random chem from the catalog, not extra of the looted chem', () => {
    const result = calculatePerkEffects([byId('pharmaFarmer')], [{ id: 'pharmaFarmer', rank: 1 }]);
    expect(result.bonuses.foundItemBonuses).toEqual([
      { perkId: 'pharmaFarmer', itemType: 'chem', extra: 1, extraRandom: true },
    ]);
    const events = rollFoundItemBonuses(result.bonuses, 'chem', { name: 'Стимулятор' });
    expect(events).toEqual([
      { perkId: 'pharmaFarmer', itemType: 'chem', amount: 1, extraRandom: true },
    ]);
    expect(sumFoundItemBonus(events)).toBe(0);
  });

  it('picks a named catalog item', () => {
    const picked = pickRandomItem([{ id: 'a', name: 'А' }, { id: 'b', name: 'Б' }]);
    expect(['А', 'Б']).toContain(picked.name);
  });
});
