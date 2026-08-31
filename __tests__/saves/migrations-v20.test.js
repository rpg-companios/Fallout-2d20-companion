// __tests__/saves/migrations-v20.test.js
// Проверяем миграцию v19->v20 для роботов (когти штурмотрона, chem не equipped, defaultPlating)

import { describe, it, expect } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations.js';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema.js';

describe('migration v19 -> v20 (robot claws & parts)', () => {
  it('CURRENT_SCHEMA_VERSION should be 20', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(20);
  });

  it('fixes equipped=true for chems/food/ammo/junk', () => {
    const state = {
      schemaVersion: 19,
      origin: { id: 'assaultron', characterType: 'robot', bodyPlan: 'assaultron' },
      equipment: {
        items: [
          { id: 'chem_stimpak', itemType: 'chem', equipped: true, locked: true },
          { id: 'food_cram', itemType: 'food', equipped: true },
          { id: 'ammo_fusion_cell', itemType: 'ammo', equipped: true },
          { id: 'weapon_combat_shotgun', itemType: 'weapon', equipped: true },
        ]
      },
      equippedWeapons: [
        { id: 'chem_rad_away', itemType: 'chem', equipped: true }
      ],
      equippedRobotSlots: {}
    };

    const migrated = migrateCharacterState(state);
    expect(migrated.schemaVersion).toBe(20);
    expect(migrated.equipment.items[0].equipped).toBe(false);
    expect(migrated.equipment.items[1].equipped).toBe(false);
    expect(migrated.equipment.items[2].equipped).toBe(false);
    expect(migrated.equipment.items[3].equipped).toBe(true); // weapon stays
    expect(migrated.equippedWeapons[0].equipped).toBe(false);
  });

  it('adds claw to assaultron arms when builtinWeaponId missing or manipulator', () => {
    const state = {
      schemaVersion: 19,
      origin: { id: 'assaultron', characterType: 'robot', bodyPlan: 'assaultron' },
      equippedRobotSlots: {
        leftArm: {
          limb: { id: 'robot_arm_assaultron', itemType: 'robotArm', builtinWeaponId: undefined },
          plating: null, frame: null, heldWeapon: null, armor: null
        },
        rightArm: {
          limb: { id: 'robot_arm_assaultron', itemType: 'robotArm', builtinWeaponId: 'robot_weapon_manipulator' },
          plating: { id: 'robot_plating_standard_arms' }, frame: null, heldWeapon: null, armor: null
        },
        head: { limb: { id: 'robot_head_assaultron_laser' }, plating: null, frame: null, heldWeapon: null, armor: null },
        body: { limb: { id: 'robot_body_assaultron' }, plating: { id: 'robot_plating_standard_body' }, frame: null, heldWeapon: null, armor: null },
        leftLeg: { limb: null, plating: null, frame: null, heldWeapon: null, armor: null },
        rightLeg: { limb: null, plating: null, frame: null, heldWeapon: null, armor: null },
      },
      equipment: { items: [] }
    };

    const migrated = migrateCharacterState(state);
    expect(migrated.schemaVersion).toBe(20);
    expect(migrated.equippedRobotSlots.leftArm.limb.builtinWeaponId).toBe('robot_weapon_claw');
    expect(migrated.equippedRobotSlots.rightArm.limb.builtinWeaponId).toBe('robot_weapon_claw');
    // standard plating removed for assaultron
    expect(migrated.equippedRobotSlots.rightArm.plating).toBeNull();
    expect(migrated.equippedRobotSlots.body.plating).toBeNull();
    // missing legs filled from defaults
    expect(migrated.equippedRobotSlots.leftLeg.limb).toBeDefined();
    expect(migrated.equippedRobotSlots.leftLeg.limb.id).toBe('robot_legs_assaultron');
  });

  it('fills missing limbs for other robots', () => {
    const state = {
      schemaVersion: 19,
      origin: { id: 'protectron', characterType: 'robot', bodyPlan: 'protectron' },
      equippedRobotSlots: {
        head: { limb: null, plating: null, frame: null, heldWeapon: null, armor: null },
        body: { limb: { id: 'robot_body_protectron' }, plating: null, frame: null, heldWeapon: null, armor: null },
      },
      equipment: { items: [] }
    };
    const migrated = migrateCharacterState(state);
    expect(migrated.equippedRobotSlots.head.limb.id).toBe('robot_head_protectron');
    // should have all expected slots
    expect(migrated.equippedRobotSlots.leftArm).toBeDefined();
    expect(migrated.equippedRobotSlots.rightArm).toBeDefined();
  });

  it('does not touch non-robot characters', () => {
    const state = {
      schemaVersion: 19,
      origin: { id: 'vaultDweller', characterType: 'human' },
      equipment: { items: [{ id: 'chem_stimpak', itemType: 'chem', equipped: true }] },
      equippedRobotSlots: null
    };
    const migrated = migrateCharacterState(state);
    // chems should stay equipped for humans (migration only for robots)
    expect(migrated.equipment.items[0].equipped).toBe(true);
    expect(migrated.schemaVersion).toBe(20);
  });
});
