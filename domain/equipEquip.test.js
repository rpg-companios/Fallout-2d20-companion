import { describe, it, expect } from 'vitest';
import { canEquipArmor, getCarryWeightLimit } from './equipEquip';

describe('armor policy restrictions', () => {
  const robotArmor = { id: 'robot_armor_x', robotOnly: true };
  const mutantArmor = { id: 'raider_mutant_x', mutantOnly: true };
  const powerArmor = { id: 'power_armor_t45' };

  it.each(['brotherhood', 'ghoul', 'synth'])('%s can equip power armor', (originId) => {
    const character = { origin: { id: originId, characterType: originId === 'synth' ? 'cyborg' : originId === 'ghoul' ? 'ghoul' : 'human' } };
    expect(canEquipArmor(powerArmor, character)).toEqual({ allowed: true, reason: null });
  });

  it('superMutant can equip only raider/mutant armor', () => {
    const character = { origin: { id: 'superMutant', characterType: 'mutant' } };
    expect(canEquipArmor(mutantArmor, character)).toEqual({ allowed: true, reason: null });
    expect(canEquipArmor(powerArmor, character).allowed).toBe(false);
    expect(canEquipArmor(robotArmor, character).allowed).toBe(false);
  });

  it.each(['robobrain', 'misterHandy', 'protectron', 'assaultron'])('%s can equip only robot armor', (originId) => {
    const character = { origin: { id: originId, characterType: 'robot' } };
    expect(canEquipArmor(robotArmor, character)).toEqual({ allowed: true, reason: null });
    expect(canEquipArmor(powerArmor, character).allowed).toBe(false);
    expect(canEquipArmor(mutantArmor, character).allowed).toBe(false);
  });
});


describe('carry weight limits', () => {
  it('keeps Assaultron robot carry weight fixed by strength and applies robot and standard armor modifiers', () => {
    const character = {
      origin: { id: 'assaultron', characterType: 'robot', bodyPlan: 'assaultron' },
      trait: { modifiers: { carryWeightFixed: 150, carryWeightStrengthMultiplier: 0 } },
      attributes: [{ name: 'STR', value: 11 }],
      equippedRobotSlots: {
        body: { armor: { carryWeightModifier: 20 }, plating: { carryWeightModifier: -10 } },
      },
      equippedArmor: {
        body: { armor: { carryWeightModifier: 5 } },
      },
    };

    expect(getCarryWeightLimit(character)).toBe(165);
  });
});
