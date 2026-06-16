import { describe, it, expect } from 'vitest';
import { getAttributeLimits, getTraitAttributeBonus, getRemainingAttributePoints, createInitialAttributes } from './characterCreation.js';

// Super mutant uses the object shape: attributes.STR = { baseBonus, min, max }
const superMutant = {
  modifiers: {
    attributes: {
      STR: { baseBonus: 2, min: 6, max: 12 },
      END: { baseBonus: 2, min: 6, max: 12 },
      CHA: { max: 6 },
      INT: { max: 6 },
    },
  },
};

describe('trait attribute limits/bonus (#6 super mutant)', () => {
  it('reads min/max from attributes.{X} object shape', () => {
    expect(getAttributeLimits(superMutant, 'STR')).toEqual({ min: 6, max: 12 });
    expect(getAttributeLimits(superMutant, 'END')).toEqual({ min: 6, max: 12 });
    // only max declared → min falls back to base 4
    expect(getAttributeLimits(superMutant, 'CHA')).toEqual({ min: 4, max: 6 });
  });

  it('no trait → base limits 4..10', () => {
    expect(getAttributeLimits(null, 'STR')).toEqual({ min: 4, max: 10 });
  });

  it('getTraitAttributeBonus handles both shapes', () => {
    expect(getTraitAttributeBonus({ baseBonus: 2 })).toBe(2);
    expect(getTraitAttributeBonus(3)).toBe(3);       // legacy flat-number shape
    expect(getTraitAttributeBonus(undefined)).toBe(0);
    expect(getTraitAttributeBonus({ max: 6 })).toBe(0); // limit-only entry, no bonus
  });

  it('getRemainingAttributePoints does not break on object shape', () => {
    const pts = getRemainingAttributePoints(createInitialAttributes(), superMutant);
    expect(typeof pts).toBe('number');
    expect(Number.isNaN(pts)).toBe(false);
  });

  it('legacy minLimits/maxLimits still take priority', () => {
    const trait = { modifiers: { minLimits: { STR: 5 }, maxLimits: { STR: 9 }, attributes: { STR: { min: 6, max: 12 } } } };
    expect(getAttributeLimits(trait, 'STR')).toEqual({ min: 5, max: 9 });
  });
});
