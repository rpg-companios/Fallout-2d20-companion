import { describe, it, expect, beforeEach } from 'vitest';
import { calculateRobotCarryWeight } from '../../domain/characterCreation.js';
import useCharacterStore from './characterStore.js';

describe('calculateRobotCarryWeight (pure)', () => {
  it('uses body limb carryWeight as base', () => {
    const slots = {
      body: { limb: { id: 'b', carryWeight: 225 }, armor: null, plating: null, frame: null },
    };
    expect(calculateRobotCarryWeight(slots, null)).toBe(225);
  });

  it('adds armor/plating/frame carryWeightModifier on top of body base', () => {
    const slots = {
      body: { limb: { id: 'b', carryWeight: 150 }, armor: { carryWeightModifier: 20 }, plating: { carryWeightModifier: 5 }, frame: null },
      leftArm: { limb: null, armor: { carryWeightModifier: 10 }, plating: null, frame: null },
    };
    expect(calculateRobotCarryWeight(slots, null)).toBe(150 + 20 + 5 + 10);
  });

  it('falls back to trait.carryWeightFixed when body has no carryWeight', () => {
    const slots = { body: { limb: { id: 'b' }, armor: null, plating: null, frame: null } };
    const trait = { modifiers: { carryWeightFixed: 150 } };
    expect(calculateRobotCarryWeight(slots, trait)).toBe(150);
  });

  it('defaults base to 150 when nothing is available', () => {
    expect(calculateRobotCarryWeight({}, null)).toBe(150);
  });

  it('STR is irrelevant — same result regardless of attributes (no attrs param)', () => {
    const slots = { body: { limb: { carryWeight: 225 } } };
    expect(calculateRobotCarryWeight(slots, null)).toBe(225);
  });
});

describe('robot carry weight via store derivedStats', () => {
  beforeEach(() => {
    useCharacterStore.getState().resetRobot();
  });

  it('protectron body (225) → carryWeight 225; swap to assaultron body (150) → 150', () => {
    const store = useCharacterStore.getState();
    store.initRobot('protectron');
    // place protectron body
    store.loadRobotState({
      bodyPlan: 'protectron',
      slots: {
        body: { limb: { id: 'robot_body_protectron', carryWeight: 225 }, armor: null, plating: null, frame: null },
      },
      modules: [],
    });
    store.setCharacterContext({ trait: null, level: 1, isRobot: true });
    expect(useCharacterStore.getState().derivedStats.carryWeight.total).toBe(225);

    // swap body to assaultron (150)
    store.loadRobotState({
      bodyPlan: 'protectron',
      slots: {
        body: { limb: { id: 'robot_body_assaultron', carryWeight: 150 }, armor: null, plating: null, frame: null },
      },
      modules: [],
    });
    store.setCharacterContext({ trait: null, level: 1, isRobot: true });
    expect(useCharacterStore.getState().derivedStats.carryWeight.total).toBe(150);
  });

  it('non-robot still uses STR-based formula', () => {
    const store = useCharacterStore.getState();
    store.resetRobot();
    store.loadFromLegacyData({ attributes: [{ name: 'STR', value: 8 }] });
    store.setCharacterContext({ trait: null, level: 1, isRobot: false });
    // STR 8 → 150 + 80 = 230 (default multiplier 10, base 150)
    expect(useCharacterStore.getState().derivedStats.carryWeight.total).toBe(230);
  });
});
