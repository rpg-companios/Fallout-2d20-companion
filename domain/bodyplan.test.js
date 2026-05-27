import { describe, it, expect, jest } from 'vitest';
import { resolveBodyPlan, createSlotsFromBodyPlan, getDefaultLimbs } from './bodyplan';

describe('resolveBodyPlan', () => {
  const cases = [
    ['robobrain', 'robobrain'],
    ['misterHandy', 'misterHandy'],
    ['protectron', 'protectron'],
    ['assaultron', 'assaultron'],
    ['securitron', 'humanoid'],
    ['human', 'humanoid'],
    ['ghoul', 'humanoid'],
    ['synth', 'humanoid'],
    ['superMutant', 'humanoid'],
  ];

  it.each(cases)('origin %s resolves to %s', (originId, expected) => {
    const character = { origin: { id: originId } };
    expect(resolveBodyPlan(character)).toBe(expected);
  });
});

describe('body plan slots/default limbs/canHoldWeapons', () => {
  const plans = ['robobrain', 'misterHandy', 'protectron', 'assaultron'];

  it.each(plans)('creates slot set and defaults for %s', (planId) => {
    const slots = createSlotsFromBodyPlan(planId);
    const defaults = getDefaultLimbs(planId);

    expect(Object.keys(slots).length).toBeGreaterThan(0);
    expect(Object.keys(slots).sort()).toEqual(Object.keys(defaults).sort());

    for (const key of Object.keys(slots)) {
      expect(slots[key]).toEqual(expect.objectContaining({
        limb: null,
        armor: null,
        plating: null,
        frame: null,
        heldWeapon: null,
      }));
    }
  });

  it('sets canEquipWeapon capability only on weapon-capable slots', () => {
    const robobrain = createSlotsFromBodyPlan('robobrain');
    expect(robobrain.leftArm.capabilities.canEquipWeapon).toBe(true);
    expect(robobrain.rightArm.capabilities.canEquipWeapon).toBe(true);
    expect(robobrain.head.capabilities.canEquipWeapon).toBe(true);
    expect(robobrain.body.capabilities.canEquipWeapon).toBe(false);
    expect(robobrain.chassis.capabilities.canEquipWeapon).toBe(false);
  });
});
