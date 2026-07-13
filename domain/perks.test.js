import { describe, expect, it } from 'vitest';
import { calculatePerkEffects, getPerkUnmetReasons, meetsPerkRequirements } from './perks.js';

const perks = [
  { id: 'intenseTraining', effect: 'intenseTraining' },
  { id: 'educated', effect: 'educated' },
  { id: 'snakeater', effect: 'snakeater' },
];

describe('perk requirements', () => {
  it('uses SPECIAL codes directly from perks.json prerequisites', () => {
    const perk = { prerequisites: { special: { STR: 5 }, level: 2 } };
    expect(meetsPerkRequirements(perk, [{ name: 'STR', value: 5 }], 2)).toBe(true);
    expect(getPerkUnmetReasons(perk, [{ name: 'STR', value: 4 }], 1)).toEqual({
      level: { required: 2, current: 1 },
      attributes: { STR: { required: 5, current: 4 } },
    });
  });
});

describe('perk effects', () => {
  it('aggregates selected perk bonuses per supplied character state', () => {
    const first = calculatePerkEffects(perks, ['intenseTraining', 'educated', 'snakeater'], {
      immunity: { poison: false },
    });
    const second = calculatePerkEffects(perks, ['snakeater'], {
      immunity: { poison: true },
    });

    expect(first.bonuses).toEqual({ attributePoints: 1, skillPoints: 2, poisonResistance: 2 });
    expect(second.bonuses).toEqual({ poisonResistance: 0 });
  });
});
