import { describe, it, expect, beforeEach } from 'vitest';
import useCharacterStore from './characterStore.js';
import {
  selectRobotSlots,
  selectRobotModules,
  selectRobotBodyPlan,
  selectRobotWeapons,
} from './robotSlice.js';

const resetStore = () => {
  useCharacterStore.getState().resetRobot();
};

describe('robotSlice (via characterStore)', () => {
  beforeEach(resetStore);

  it('starts with empty robot state', () => {
    const s = useCharacterStore.getState();
    expect(selectRobotBodyPlan(s)).toBe(null);
    expect(selectRobotSlots(s)).toEqual({});
    expect(selectRobotModules(s)).toEqual([]);
  });

  it('initRobot creates empty slots for a body plan', () => {
    useCharacterStore.getState().initRobot('protectron');
    const s = useCharacterStore.getState();
    expect(selectRobotBodyPlan(s)).toBe('protectron');
    const keys = Object.keys(selectRobotSlots(s));
    expect(keys).toEqual(['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg']);
    for (const k of keys) {
      expect(selectRobotSlots(s)[k]).toMatchObject({
        limb: null, armor: null, plating: null, frame: null, heldWeapon: null,
      });
    }
  });

  it('setRobotArmorLayer applies and clears a layer, enforcing incompatibility', () => {
    const store = useCharacterStore.getState();
    store.initRobot('protectron');

    const plating = { id: 'p1', carryWeightModifier: 5 };
    let res = store.setRobotArmorLayer('body', 'plating', plating);
    expect(res.ok).toBe(true);
    expect(selectRobotSlots(useCharacterStore.getState()).body.plating).toEqual(plating);

    // armor that is incompatible with existing plating should be rejected
    const armor = { id: 'a1', incompatibleLayers: ['plating'] };
    res = store.setRobotArmorLayer('body', 'armor', armor);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();

    // clearing the layer works
    res = store.setRobotArmorLayer('body', 'plating', null);
    expect(res.ok).toBe(true);
    expect(selectRobotSlots(useCharacterStore.getState()).body.plating).toBe(null);
  });

  it('equip/unequip held weapon respects limb capability', () => {
    const store = useCharacterStore.getState();
    store.initRobot('protectron');
    const character = { origin: { robotBodyPlan: 'protectron' } };

    // place an arm limb that can hold weapons
    const armLimb = { id: 'arm', itemType: 'robotArm', canHoldWeapons: true, weaponSlots: 1, compatibleBodyPlans: ['protectron'] };
    const r1 = store.replaceLimb('leftArm', armLimb, character, []);
    expect(r1.ok).toBe(true);

    const weapon = { id: 'w_pistol', weight: 3 };
    const r2 = store.equipHeldWeapon('leftArm', weapon, character);
    expect(r2.ok).toBe(true);
    expect(selectRobotSlots(useCharacterStore.getState()).leftArm.heldWeapon.id).toBe('w_pistol');

    // weapon appears in attack list
    expect(selectRobotWeapons(useCharacterStore.getState()).some((w) => w.id === 'w_pistol')).toBe(true);

    store.unequipHeldWeapon('leftArm');
    expect(selectRobotSlots(useCharacterStore.getState()).leftArm.heldWeapon).toBe(null);
  });

  it('cannot equip held weapon on a limb that cannot hold weapons', () => {
    const store = useCharacterStore.getState();
    store.initRobot('protectron');
    const character = { origin: { robotBodyPlan: 'protectron' } };
    const fixedLimb = { id: 'fixed', itemType: 'robotArm', canHoldWeapons: false, weaponSlots: 0, compatibleBodyPlans: ['protectron'] };
    store.replaceLimb('rightArm', fixedLimb, character, []);
    const res = store.equipHeldWeapon('rightArm', { id: 'w', weight: 1 }, character);
    expect(res.ok).toBe(false);
  });

  it('modules add (dedup by id) and remove', () => {
    const store = useCharacterStore.getState();
    store.initRobot('protectron');
    store.addRobotModule({ id: 'm1', name: 'Recon' });
    store.addRobotModule({ id: 'm1', name: 'Recon dup' }); // ignored
    store.addRobotModule({ id: 'm2', name: 'Hazard' });
    expect(selectRobotModules(useCharacterStore.getState()).map((m) => m.id)).toEqual(['m1', 'm2']);
    store.removeRobotModule('m1');
    expect(selectRobotModules(useCharacterStore.getState()).map((m) => m.id)).toEqual(['m2']);
  });

  it('loadRobotState hydrates from a legacy snapshot', () => {
    const store = useCharacterStore.getState();
    store.loadRobotState({
      bodyPlan: 'robobrain',
      slots: { head: { limb: { id: 'h' }, armor: null, plating: null, frame: null, heldWeapon: null } },
      modules: [{ id: 'm9' }],
    });
    const s = useCharacterStore.getState();
    expect(selectRobotBodyPlan(s)).toBe('robobrain');
    expect(selectRobotSlots(s).head.limb.id).toBe('h');
    expect(selectRobotModules(s)).toHaveLength(1);
  });
});
