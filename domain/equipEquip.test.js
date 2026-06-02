import { describe, it, expect, jest } from 'vitest';
import { canEquipArmor, getCarryWeightLimit } from './equipEquip';

describe('armor policy restrictions', () => {
  const robotArmor = { id: 'robot_armor_x', robotOnly: true };
  const mutantArmor = { id: 'raider_mutant_x', mutantOnly: true };
  const powerArmor = { id: 'power_armor_t45' };

  it.each(['human', 'ghoul', 'synth'])('%s can equip power armor', (originId) => {
    const character = { origin: { id: originId, armorPolicy: 'humanoid_full' } };
    expect(canEquipArmor(powerArmor, character)).toEqual({ allowed: true, reason: null });
  });

  it('superMutant can equip only raider/mutant armor', () => {
    const character = { origin: { id: 'superMutant', armorPolicy: 'supermutant_raider_only' } };
    expect(canEquipArmor(mutantArmor, character)).toEqual({ allowed: true, reason: null });
    expect(canEquipArmor(powerArmor, character).allowed).toBe(false);
    expect(canEquipArmor(robotArmor, character).allowed).toBe(false);
  });

  it.each(['robobrain', 'misterHandy', 'protectron', 'assaultron'])('%s can equip only robot armor', (originId) => {
    const character = { origin: { id: originId, armorPolicy: 'robot_only' } };
    expect(canEquipArmor(robotArmor, character)).toEqual({ allowed: true, reason: null });
    expect(canEquipArmor(powerArmor, character).allowed).toBe(false);
    expect(canEquipArmor(mutantArmor, character).allowed).toBe(false);
  });
});


describe('carry weight limits', () => {
  it('keeps Assaultron robot carry weight fixed by strength and applies robot and standard armor modifiers', () => {
    const character = {
      origin: { id: 'assaultron', isRobot: true, armorPolicy: 'robot_only' },
      trait: { modifiers: { isRobot: true, carryWeightFixed: 150, carryWeightStrengthMultiplier: 0 } },
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
