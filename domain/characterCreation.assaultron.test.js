import { describe, expect, it } from 'vitest';
import { calculateCarryWeight, calculateMeleeBonus, calculateMeleeBonusValue } from './characterCreation.js';

const attributes = (str) => [{ name: 'STR', value: str }];
const assaultronTrait = {
  modifiers: {
    carryWeightFixed: 150,
    carryWeightStrengthMultiplier: 0,
    meleeBonusDelta: 1,
  },
};

describe('Assaultron Designed for the Frontline calculations', () => {
  it('adds trait melee bonus to strength melee bonus for mechanics and display', () => {
    expect(calculateMeleeBonusValue(attributes(7), assaultronTrait)).toBe(2);
    expect(calculateMeleeBonus(attributes(7), assaultronTrait)).toBe('+2 {CD}');
  });

  it('keeps base carry weight fixed by strength and applies armor carry modifiers', () => {
    expect(calculateCarryWeight(attributes(11), assaultronTrait)).toBe(150);
    expect(calculateCarryWeight(attributes(11), assaultronTrait, {
      equippedRobotSlots: {
        body: { armor: { carryWeightModifier: 20 }, plating: { carryWeightModifier: -10 } },
        head: { frame: { carryWeightModifier: 5 } },
      },
      equippedArmor: {
        body: { armor: { carryWeightModifier: 10 } },
      },
    })).toBe(175);
  });
});
