import { describe, expect, it } from 'vitest';
import { hasDamageImmunity, hasPoisonImmunity, hasRadiationImmunity } from './immunities.js';

describe('immunity helpers', () => {
  it('grants radiation and poison immunity to any robot origin', () => {
    const character = { origin: { id: 'assaultron', isRobot: true }, trait: null };
    expect(hasRadiationImmunity(character)).toBe(true);
    expect(hasPoisonImmunity(character)).toBe(true);
  });

  it('reads non-robot immunities from trait modifiers', () => {
    const character = {
      origin: { id: 'superMutant', isRobot: false },
      trait: { modifiers: { immunities: ['radiation', 'poison'] } },
    };
    expect(hasDamageImmunity(character, 'radiation')).toBe(true);
    expect(hasDamageImmunity(character, 'poison')).toBe(true);
    expect(hasDamageImmunity(character, 'disease')).toBe(false);
  });
});
