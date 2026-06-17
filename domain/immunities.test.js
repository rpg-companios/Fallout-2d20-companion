import { describe, expect, it } from 'vitest';
import { hasDamageImmunity, hasPoisonImmunity, hasRadiationImmunity } from './immunities.js';

describe('immunity helpers', () => {
  it('reads immunities declared on origin.immunities', () => {
    const character = {
      origin: { id: 'assaultron', characterType: 'robot', immunities: ['disease', 'radiation', 'poison'] },
      trait: null,
    };
    expect(hasRadiationImmunity(character)).toBe(true);
    expect(hasPoisonImmunity(character)).toBe(true);
    expect(hasDamageImmunity(character, 'disease')).toBe(true);
  });

  it('reads immunities from trait.immunities for non-robot origins', () => {
    const character = {
      origin: { id: 'superMutant', characterType: 'mutant' },
      trait: { modifiers: { immunities: ['radiation', 'poison'] } },
    };
    expect(hasDamageImmunity(character, 'radiation')).toBe(true);
    expect(hasDamageImmunity(character, 'poison')).toBe(true);
    expect(hasDamageImmunity(character, 'disease')).toBe(false);
  });

  it('merges origin.immunities with trait.immunities (additive, no double-counting)', () => {
    const character = {
      origin: { id: 'ghoul', characterType: 'ghoul', immunities: ['radiation'] },
      trait: { modifiers: { immunities: ['radiation'] } },
    };
    // Single hit even though both lists contain 'radiation'.
    expect(hasRadiationImmunity(character)).toBe(true);
  });

  it('returns false for unknown immunity type', () => {
    const character = { origin: { id: 'brotherhood', characterType: 'human' }, trait: null };
    expect(hasDamageImmunity(character, 'radiation')).toBe(false);
    expect(hasDamageImmunity(character, 'poison')).toBe(false);
  });
});
