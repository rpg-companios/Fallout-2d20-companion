import { describe, it, expect } from 'vitest';
import { initRobotSlots } from './robotEquip';
import kits from '../data/equipmentKits/robobrain.json';
import robotHeads from '../data/equipment/robot/robotheads.json';
import robotBody from '../data/equipment/robot/robotbody.json';
import robotLegs from '../data/equipment/robot/robotlegs.json';
import robotArms from '../data/equipment/robot/robotarms.json';
import robotWeapons from '../data/equipment/robot/weapons.json';

describe('character creation flow — robobrain kits', () => {
  const robotCatalog = {
    heads: robotHeads,
    bodies: robotBody,
    legs: robotLegs,
    arms: robotArms,
    weapons: robotWeapons,
  };

  const toResolved = (items) => items.map((x) => ({ ...x, id: x.itemId || x.weaponId }));

  it('servomechanizmy kit equips robobrain parts, mesmetron, manipulators and keeps misc items in inventory', () => {
    const { slots, weapons, inventoryItems } = initRobotSlots(
      'robobrain',
      toResolved(kits.robobrain_servomechanizmy.items),
      robotCatalog,
    );

    expect(slots.head.limb?.id).toBe('robot_head_robobrain');
    expect(slots.body.limb?.id).toBe('robot_body_robobrain');
    expect(slots.chassis.limb?.id).toBe('robot_legs_robobrain_treads');

    // Left arm from kit is a weapon-as-limb (tesla), right arm is smoke manipulator from kit
    expect(slots.leftArm.limb?.id).toBe('robot_weapon_tesla_arm');
    expect(slots.rightArm.limb?.id).toBe('robot_arm_smoke_manipulator');

    // Both arms in this kit can operate weapon slots, so character can use weapons in W&A screen.
    const canUseWeaponHands = [slots.leftArm, slots.rightArm].some((slot) => slot?.limb?.canHoldWeapons === true);
    expect(canUseWeaponHands).toBe(true);

    // Mesmetron must be available as builtin equipped weapon from robobrain head.
    const mesmetron = weapons.find((w) => w.id === 'robot_weapon_mesmetron');
    expect(mesmetron).toBeTruthy();
    expect(mesmetron?.isBuiltin).toBe(true);
    expect(mesmetron?.sourceSlot).toBe('head');

    // Non-equipped misc items from kit stay in inventory.
    expect(inventoryItems.some((item) => item.id === 'robot_item_repair_kit')).toBe(true);

    // Choice clothes / roll-table entries are not auto-equipped to robot limbs.
    expect(inventoryItems.some((item) => item.itemType === 'clothing')).toBe(false);
  });

  it('US Army kit keeps robobrain body parts, equips manipulators, mesmetron is still builtin, no protectron substitution', () => {
    const { slots, weapons } = initRobotSlots(
      'robobrain',
      toResolved(kits.robobrain_us_army.items),
      robotCatalog,
    );

    expect(slots.head.limb?.id).toBe('robot_head_robobrain');
    expect(slots.body.limb?.id).toBe('robot_body_robobrain');
    expect(slots.chassis.limb?.id).toBe('robot_legs_robobrain_treads');

    expect(slots.leftArm.limb?.id).toBe('robot_arm_smoke_manipulator');
    expect(slots.rightArm.limb?.id).toBe('robot_arm_smoke_manipulator');

    const mesmetron = weapons.find((w) => w.id === 'robot_weapon_mesmetron');
    expect(mesmetron?.isBuiltin).toBe(true);
    expect(Object.values(slots).some((s) => String(s?.limb?.id || '').includes('protectron'))).toBe(false);
  });
});
