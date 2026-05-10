import { describe, it, expect } from 'vitest';
import {
  isRobotCharacter,
  getRobotSlotKeys,
  createEmptyRobotSlots,
  initRobotSlots,
  getBuiltinWeaponsFromSlots,
  canEquipRobotArmor,
  canReplaceLimb,
  applyLimbReplacement,
  canEquipWeaponToSlot,
} from './robotEquip.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const protectronManipulator = {
  id: 'robot_arm_protectron_manipulator',
  itemType: 'robotArm',
  slot: 'left',
  builtinWeapons: [
    {
      id: 'protectron_manipulator_punch',
      damage: 3,
      damageType: 'physical',
      weaponType: 'Melee',
    }
  ]
};

const laserGun = {
  id: 'weapon_laser_gun',
  itemType: 'weapon',
  slot: 'right',
  damage: 5,
  weight: 2,
};

const standardPlating = {
  id: 'robot_plating_standard_body',
  itemType: 'plating',
  layer: 'plating',
  robotLocation: 'Main Body',
  incompatibleLayers: ['armor', 'frame'],
  dr: 2,
};

const defaultHead = {
  id: 'robot_head_protectron',
  itemType: 'robotHead',
  defaultForBodyPlan: 'protectron',
};

const defaultBody = {
  id: 'robot_body_protectron',
  itemType: 'robotBody',
  robotBodyPlan: 'protectron',
};

const defaultLeg = {
  id: 'robot_leg_protectron',
  itemType: 'robotLeg',
  compatibleBodyPlans: ['protectron'],
};

const robotCatalog = {
  heads: [defaultHead],
  bodies: [defaultBody],
  arms: [],
  legs: [defaultLeg],
};

// Mister Handy fixtures
const manipulatorArm = {
  id: 'robot_arm_manipulator',
  itemType: 'robotArm',
  slot: 'left',
  builtinWeapons: [
    {
      id: 'manipulator_punch',
      damage: 2,
      damageType: 'physical',
      weaponType: 'Melee',
    }
  ]
};

const flamethrower = {
  id: 'robot_weapon_flamethrower',
  itemType: 'weapon',
  slot: 'right',
  limbSlot: 'arm2',
  weaponSlots: 0,
  damage: 3,
  damageType: 'fire',
  weight: 0,
};

const circularSaw = {
  id: 'robot_weapon_circular_saw',
  itemType: 'weapon',
  slot: 'right',
  limbSlot: 'arm3',
  damage: 3,
  weight: 3,
};

const laserCutter = {
  id: 'robot_weapon_laser_cutter',
  itemType: 'weapon',
  slot: 'left',
  limbSlot: 'arm1',
  damage: 4,
  damageType: 'energy',
  weight: 0,
};

const handyHead = {
  id: 'robot_head_handy',
  itemType: 'robotHead',
  defaultForBodyPlan: 'misterHandy',
};

const handyBody = {
  id: 'robot_body_handy',
  itemType: 'robotBody',
  robotBodyPlan: 'misterHandy',
};

const handyThruster = {
  id: 'robot_thruster_handy',
  itemType: 'robotLeg',
  compatibleBodyPlans: ['misterHandy'],
};

const handyCatalog = {
  heads: [handyHead],
  bodies: [handyBody],
  arms: [],
  legs: [handyThruster],
};

// ---------------------------------------------------------------------------
// isRobotCharacter
// ---------------------------------------------------------------------------

describe('isRobotCharacter', () => {
  it('returns true when origin.isRobot is true', () => {
    expect(isRobotCharacter({ origin: { isRobot: true } })).toBe(true);
  });

  it('returns false when origin.isRobot is false', () => {
    expect(isRobotCharacter({ origin: { isRobot: false } })).toBe(false);
  });

  it('returns false when origin.isRobot is absent', () => {
    expect(isRobotCharacter({ origin: {} })).toBe(false);
  });

  it('returns false when origin is absent', () => {
    expect(isRobotCharacter({})).toBe(false);
  });

  it('returns false for null/undefined character', () => {
    expect(isRobotCharacter(null)).toBe(false);
    expect(isRobotCharacter(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRobotSlotKeys
// ---------------------------------------------------------------------------

describe('getRobotSlotKeys', () => {
  it('returns protectron slots', () => {
    expect(getRobotSlotKeys('protectron')).toEqual([
      'head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg',
    ]);
  });

  it('returns misterHandy slots', () => {
    expect(getRobotSlotKeys('misterHandy')).toEqual([
      'head', 'body', 'arm1', 'arm2', 'arm3', 'thruster',
    ]);
  });

  it('returns robobrain slots', () => {
    expect(getRobotSlotKeys('robobrain')).toEqual([
      'head', 'body', 'leftArm', 'rightArm', 'chassis',
    ]);
  });

  it('falls back to protectron for unknown body plan', () => {
    expect(getRobotSlotKeys('unknown')).toEqual(getRobotSlotKeys('protectron'));
  });
});

// ---------------------------------------------------------------------------
// createEmptyRobotSlots
// ---------------------------------------------------------------------------

describe('createEmptyRobotSlots', () => {
  it('creates all null fields for each protectron slot', () => {
    const slots = createEmptyRobotSlots('protectron');
    const keys = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    expect(Object.keys(slots)).toEqual(keys);
    for (const k of keys) {
      expect(slots[k]).toEqual({ limb: null, armor: null, plating: null, frame: null, heldWeapon: null });
    }
  });
});

// ---------------------------------------------------------------------------
// initRobotSlots — protectron_standard
// ---------------------------------------------------------------------------

describe('initRobotSlots — protectron_standard', () => {
  // Simulates the resolved kit items for protectron_standard:
  // 2x manipulator arms, laser gun, plating, module, module, misc, currency
  const resolvedItems = [
    { ...protectronManipulator, itemType: 'robotArm', slot: 'left' },
    { ...protectronManipulator, itemType: 'robotArm', slot: 'right' },
    { ...laserGun, itemType: 'weapon', slot: 'left' },
    { ...standardPlating },
    { id: 'robot_module_recon_sensors', itemType: 'module' },
    { id: 'robot_module_hazard_detection', itemType: 'module' },
    { id: 'robot_item_repair_kit', itemType: 'misc' },
    { itemType: 'currency', quantity: 20 },
  ];

  it('returns slots, weapons, modules, inventoryItems', () => {
    const result = initRobotSlots('protectron', resolvedItems, robotCatalog);
    expect(result).toHaveProperty('slots');
    expect(result).toHaveProperty('weapons');
    expect(result).toHaveProperty('modules');
    expect(result).toHaveProperty('inventoryItems');
  });

  it('places manipulator arms in leftArm and rightArm', () => {
    const { slots } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    expect(slots.leftArm.limb?.id).toBe('robot_arm_protectron_manipulator');
    expect(slots.rightArm.limb?.id).toBe('robot_arm_protectron_manipulator');
  });

  it('auto-fills head, body, legs from catalog', () => {
    const { slots } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    expect(slots.head.limb?.id).toBe('robot_head_protectron');
    expect(slots.body.limb?.id).toBe('robot_body_protectron');
    expect(slots.leftLeg.limb?.id).toBe('robot_leg_protectron');
    expect(slots.rightLeg.limb?.id).toBe('robot_leg_protectron');
  });

  it('places laser gun as heldWeapon in the slot with the matching manipulator', () => {
    const { slots } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    const hasLaser =
      slots.leftArm.heldWeapon?.id === 'weapon_laser_gun' ||
      slots.rightArm.heldWeapon?.id === 'weapon_laser_gun';
    expect(hasLaser).toBe(true);
  });

  it('places plating on body slot', () => {
    const { slots } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    expect(slots.body.plating?.id).toBe('robot_plating_standard_body');
  });

  it('collects modules', () => {
    const { modules } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    expect(modules).toHaveLength(2);
    expect(modules.map((m) => m.id)).toContain('robot_module_recon_sensors');
    expect(modules.map((m) => m.id)).toContain('robot_module_hazard_detection');
  });

  it('puts misc and currency items into inventoryItems', () => {
    const { inventoryItems } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    const types = inventoryItems.map((i) => i.itemType ?? i.id);
    expect(types).toContain('misc');
    expect(types).toContain('currency');
  });

  it('builds weapons array from manipulator arms and held weapon', () => {
    const { weapons } = initRobotSlots('protectron', resolvedItems, robotCatalog);
    // The arm that has a heldWeapon should contribute the held weapon, not the manipulator
    // The arm without a heldWeapon should contribute the manipulator
    const ids = weapons.map((w) => w.id);
    expect(ids).toContain('weapon_laser_gun');
    expect(ids).toContain('robot_weapon_protectron_manipulator');
  });
});

// ---------------------------------------------------------------------------
// initRobotSlots — mister_handy_assistant
// ---------------------------------------------------------------------------

describe('initRobotSlots — mister_handy_assistant', () => {
  // Все три оружия Мистера Помощника имеют replacesArm: true — занимают слот как limb
  const resolvedItems = [
    { ...manipulatorArm, itemType: 'weapon' },
    { ...flamethrower, itemType: 'weapon' },
    { ...circularSaw, itemType: 'weapon' },
    { ...standardPlating, robotLocation: 'Main Body' },
    { id: 'robot_item_repair_kit', itemType: 'misc' },
    { id: 'robot_module_boiler', itemType: 'module' },
    { itemType: 'currency', quantity: 10 },
  ];

  it('fills arm1 with the manipulator limb (builtinManipulator)', () => {
    const { slots } = initRobotSlots('misterHandy', resolvedItems, handyCatalog);
    expect(slots.arm1.limb?.id).toBe('robot_weapon_manipulator');
  });

  it('fills arm2 and arm3 with replacesArm weapons as limbs', () => {
    const { slots } = initRobotSlots('misterHandy', resolvedItems, handyCatalog);
    const arm2LimbId = slots.arm2.limb?.id;
    const arm3LimbId = slots.arm3.limb?.id;
    expect([arm2LimbId, arm3LimbId]).toContain('robot_weapon_flamethrower');
    expect([arm2LimbId, arm3LimbId]).toContain('robot_weapon_circular_saw');
  });

  it('arm slots have no heldWeapon when replacesArm weapons are installed', () => {
    const { slots } = initRobotSlots('misterHandy', resolvedItems, handyCatalog);
    expect(slots.arm1.heldWeapon).toBeNull();
    expect(slots.arm2.heldWeapon).toBeNull();
    expect(slots.arm3.heldWeapon).toBeNull();
  });

  it('auto-fills head, body, thruster from catalog', () => {
    const { slots } = initRobotSlots('misterHandy', resolvedItems, handyCatalog);
    expect(slots.head.limb?.id).toBe('robot_head_handy');
    expect(slots.body.limb?.id).toBe('robot_body_handy');
    expect(slots.thruster.limb?.id).toBe('robot_thruster_handy');
  });

  it('builds weapons array including the manipulator', () => {
    const { weapons } = initRobotSlots('misterHandy', resolvedItems, handyCatalog);
    const ids = weapons.map((w) => w.id);
    expect(ids).toContain('robot_weapon_manipulator');
  });

  it('each weapon has a sourceSlot set to an arm key', () => {
    const { weapons } = initRobotSlots('misterHandy', resolvedItems, handyCatalog);
    for (const w of weapons) {
      expect(['arm1', 'arm2', 'arm3']).toContain(w.sourceSlot);
    }
  });

  // Вариант с лазерным резаком вместо манипулятора
  describe('с лазерным резаком вместо манипулятора', () => {
    const itemsWithLaser = [
      { ...laserCutter, itemType: 'weapon' },
      { ...flamethrower, itemType: 'weapon' },
      { ...circularSaw, itemType: 'weapon' },
      { ...standardPlating, robotLocation: 'Main Body' },
    ];

    it('все три arm-слота заняты replacesArm оружиями как limb', () => {
      const { slots } = initRobotSlots('misterHandy', itemsWithLaser, handyCatalog);
      const limbIds = ['arm1', 'arm2', 'arm3'].map((k) => slots[k].limb?.id);
      expect(limbIds).toContain('robot_weapon_laser_cutter');
      expect(limbIds).toContain('robot_weapon_flamethrower');
      expect(limbIds).toContain('robot_weapon_circular_saw');
    });

    it('нет heldWeapon ни в одном arm-слоте', () => {
      const { slots } = initRobotSlots('misterHandy', itemsWithLaser, handyCatalog);
      for (const k of ['arm1', 'arm2', 'arm3']) {
        expect(slots[k].heldWeapon).toBeNull();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// canEquipRobotArmor — layer compatibility matrix
// ---------------------------------------------------------------------------

describe('canEquipRobotArmor', () => {
  const emptySlots = createEmptyRobotSlots('protectron');

  const platingItem = {
    id: 'plating_a',
    layer: 'plating',
    incompatibleLayers: ['armor', 'frame'],
  };

  const armorItem = {
    id: 'armor_a',
    layer: 'armor',
    incompatibleLayers: ['plating'],
  };

  const frameItem = {
    id: 'frame_a',
    layer: 'frame',
    incompatibleLayers: ['plating'],
  };

  it('allows plating on an empty slot', () => {
    const result = canEquipRobotArmor(platingItem, 'body', 'plating', emptySlots);
    expect(result.allowed).toBe(true);
  });

  it('allows armor on an empty slot', () => {
    const result = canEquipRobotArmor(armorItem, 'body', 'armor', emptySlots);
    expect(result.allowed).toBe(true);
  });

  it('allows frame on an empty slot', () => {
    const result = canEquipRobotArmor(frameItem, 'body', 'frame', emptySlots);
    expect(result.allowed).toBe(true);
  });

  it('blocks plating when armor is already equipped', () => {
    const slots = {
      ...emptySlots,
      body: { ...emptySlots.body, armor: armorItem },
    };
    const result = canEquipRobotArmor(platingItem, 'body', 'plating', slots);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.armorLayerIncompatible');
  });

  it('blocks plating when frame is already equipped', () => {
    const slots = {
      ...emptySlots,
      body: { ...emptySlots.body, frame: frameItem },
    };
    const result = canEquipRobotArmor(platingItem, 'body', 'plating', slots);
    expect(result.allowed).toBe(false);
  });

  it('blocks armor when plating is already equipped', () => {
    const slots = {
      ...emptySlots,
      body: { ...emptySlots.body, plating: platingItem },
    };
    const result = canEquipRobotArmor(armorItem, 'body', 'armor', slots);
    expect(result.allowed).toBe(false);
  });

  it('allows armor when only frame is equipped', () => {
    const slots = {
      ...emptySlots,
      body: { ...emptySlots.body, frame: frameItem },
    };
    const result = canEquipRobotArmor(armorItem, 'body', 'armor', slots);
    expect(result.allowed).toBe(true);
  });

  it('allows frame when only armor is equipped', () => {
    const slots = {
      ...emptySlots,
      body: { ...emptySlots.body, armor: armorItem },
    };
    const result = canEquipRobotArmor(frameItem, 'body', 'frame', slots);
    expect(result.allowed).toBe(true);
  });

  it('returns invalid slot error for unknown slotKey', () => {
    const result = canEquipRobotArmor(platingItem, 'nonexistent', 'plating', emptySlots);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.invalidSlot');
  });
});

// ---------------------------------------------------------------------------
// applyLimbReplacement
// ---------------------------------------------------------------------------

describe('applyLimbReplacement', () => {
  const oldLimb = {
    id: 'robot_arm_old',
    builtinWeaponId: 'old_builtin_weapon',
    canHoldWeapons: false,
  };

  const newLimb = {
    id: 'robot_arm_new',
    canHoldWeapons: true,
    builtinManipulator: true,
  };

  const newLimbNoHold = {
    id: 'robot_arm_no_hold',
    canHoldWeapons: false,
  };

  const heldWeapon = { id: 'weapon_pistol', damage: 4 };

  it('replaces the limb in the specified slot', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = oldLimb;

    const { slots: updated } = applyLimbReplacement(slots, 'leftArm', newLimb);
    expect(updated.leftArm.limb).toBe(newLimb);
  });

  it('does not mutate the original slots object', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = oldLimb;

    applyLimbReplacement(slots, 'leftArm', newLimb);
    expect(slots.leftArm.limb).toBe(oldLimb);
  });

  it('keeps heldWeapon when new limb canHoldWeapons', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = oldLimb;
    slots.leftArm.heldWeapon = heldWeapon;

    const { slots: updated } = applyLimbReplacement(slots, 'leftArm', newLimb);
    expect(updated.leftArm.heldWeapon).toBe(heldWeapon);
  });

  it('clears heldWeapon when new limb cannot hold weapons', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = oldLimb;
    slots.leftArm.heldWeapon = heldWeapon;

    const { slots: updated } = applyLimbReplacement(slots, 'leftArm', newLimbNoHold);
    expect(updated.leftArm.heldWeapon).toBeNull();
  });


  it('removes sibling slot limb when replacing dual-slot arm kits', () => {
    const slots = createEmptyRobotSlots('protectron');
    const dual = { id: 'robot_shocker_arms', canHoldWeapons: false };
    slots.leftArm.limb = dual;
    slots.rightArm.limb = dual;

    const { slots: updated } = applyLimbReplacement(slots, 'leftArm', newLimb);
    expect(updated.leftArm.limb).toBe(newLimb);
    expect(updated.rightArm.limb).toBeNull();
  });
  it('rebuilds weapons array after replacement', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = oldLimb; // had builtinWeaponId

    const { weapons } = applyLimbReplacement(slots, 'leftArm', newLimb);
    // new limb is a builtinManipulator with no heldWeapon → appears as manipulator weapon
    const ids = weapons.map((w) => w.id);
    expect(ids).not.toContain('old_builtin_weapon');
    expect(ids).toContain('robot_arm_new');
  });

  it('includes sourceSlot on rebuilt weapons', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = newLimb;

    const { weapons } = applyLimbReplacement(slots, 'leftArm', newLimb);
    const armWeapon = weapons.find((w) => w.id === 'robot_arm_new');
    expect(armWeapon?.sourceSlot).toBe('leftArm');
  });
});

// ---------------------------------------------------------------------------
// getBuiltinWeaponsFromSlots
// ---------------------------------------------------------------------------

describe('getBuiltinWeaponsFromSlots', () => {
  it('returns empty array for empty slots', () => {
    expect(getBuiltinWeaponsFromSlots(createEmptyRobotSlots('protectron'))).toEqual([]);
  });

  it('returns empty array for null/undefined input', () => {
    expect(getBuiltinWeaponsFromSlots(null)).toEqual([]);
    expect(getBuiltinWeaponsFromSlots(undefined)).toEqual([]);
  });

  it('includes builtinWeaponId as isBuiltin weapon', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.head.limb = { id: 'assaultron_head', builtinWeaponId: 'assaultron_laser' };

    const weapons = getBuiltinWeaponsFromSlots(slots);
    expect(weapons).toHaveLength(1);
    expect(weapons[0].id).toBe('assaultron_laser');
    expect(weapons[0].isBuiltin).toBe(true);
    expect(weapons[0].sourceSlot).toBe('head');
  });

  it('includes manipulator as weapon when no heldWeapon', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = { id: 'manip_arm', builtinManipulator: true };

    const weapons = getBuiltinWeaponsFromSlots(slots);
    expect(weapons).toHaveLength(1);
    expect(weapons[0].id).toBe('manip_arm');
    expect(weapons[0].isManipulator).toBe(true);
  });

  it('does NOT include manipulator when heldWeapon is present', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.leftArm.limb = { id: 'manip_arm', builtinManipulator: true };
    slots.leftArm.heldWeapon = { id: 'pistol' };

    const weapons = getBuiltinWeaponsFromSlots(slots);
    const ids = weapons.map((w) => w.id);
    expect(ids).not.toContain('manip_arm');
    expect(ids).toContain('pistol');
  });


  it('deduplicates identical builtin attacks from two manipulator arms', () => {
    const slots = createEmptyRobotSlots('protectron');
    const sharedAttacks = [
      { id: 'robot_melee', damage: 2 },
      { id: 'robot_laser', damage: 3 },
    ];
    slots.leftArm.limb = { id: 'left_manip', builtinWeapons: sharedAttacks };
    slots.rightArm.limb = { id: 'right_manip', builtinWeapons: sharedAttacks };

    const weapons = getBuiltinWeaponsFromSlots(slots);
    const ids = weapons.map((w) => w.id);
    expect(ids).toEqual(['robot_melee', 'robot_laser']);
  });
  it('includes heldWeapon with sourceSlot', () => {
    const slots = createEmptyRobotSlots('protectron');
    slots.rightArm.heldWeapon = { id: 'rifle', damage: 8 };

    const weapons = getBuiltinWeaponsFromSlots(slots);
    expect(weapons).toHaveLength(1);
    expect(weapons[0].id).toBe('rifle');
    expect(weapons[0].sourceSlot).toBe('rightArm');
  });
});

// ---------------------------------------------------------------------------
// canEquipWeaponToSlot
// ---------------------------------------------------------------------------

describe('canEquipWeaponToSlot', () => {
  const holdingLimb = { canHoldWeapons: true, maxHandelWeaponWeight: 5, excludeTwoHanded: false };
  const noHoldLimb  = { canHoldWeapons: false };
  const lightOnlyLimb = { canHoldWeapons: true, maxHandelWeaponWeight: 2 };
  const noTwoHandedLimb = { canHoldWeapons: true, excludeTwoHanded: true };

  it('allows a valid weapon', () => {
    const result = canEquipWeaponToSlot({ weight: 3 }, { limb: holdingLimb });
    expect(result.allowed).toBe(true);
  });

  it('blocks when limb cannot hold weapons', () => {
    const result = canEquipWeaponToSlot({ weight: 1 }, { limb: noHoldLimb });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.limbCannotHoldWeapons');
  });

  it('blocks when weapon exceeds max weight', () => {
    const result = canEquipWeaponToSlot({ weight: 5 }, { limb: lightOnlyLimb });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.weaponTooHeavyForLimb');
  });

  it('blocks two-handed weapon on excludeTwoHanded limb', () => {
    const result = canEquipWeaponToSlot({ weight: 1, twoHanded: true }, { limb: noTwoHandedLimb });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.limbExcludesTwoHandedWeapons');
  });

  it('allows one-handed weapon on excludeTwoHanded limb', () => {
    const result = canEquipWeaponToSlot({ weight: 1, twoHanded: false }, { limb: noTwoHandedLimb });
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canReplaceLimb
// ---------------------------------------------------------------------------

describe('canReplaceLimb', () => {
  const character = { origin: { robotBodyPlan: 'protectron' } };

  it('allows a limb with matching compatibleBodyPlans', () => {
    const limb = { id: 'arm', compatibleBodyPlans: ['protectron', 'assaultron'] };
    expect(canReplaceLimb('leftArm', limb, character).allowed).toBe(true);
  });

  it('blocks a limb with non-matching compatibleBodyPlans', () => {
    const limb = { id: 'arm', compatibleBodyPlans: ['misterHandy'] };
    const result = canReplaceLimb('leftArm', limb, character);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.limbIncompatibleBodyPlan');
  });

  it('allows a limb with matching defaultForBodyPlan', () => {
    const limb = { id: 'arm', defaultForBodyPlan: 'protectron' };
    expect(canReplaceLimb('leftArm', limb, character).allowed).toBe(true);
  });

  it('blocks a limb with non-matching defaultForBodyPlan', () => {
    const limb = { id: 'arm', defaultForBodyPlan: 'robobrain' };
    const result = canReplaceLimb('leftArm', limb, character);
    expect(result.allowed).toBe(false);
  });

  it('allows a limb with no compatibility constraints', () => {
    const limb = { id: 'universal_arm' };
    expect(canReplaceLimb('leftArm', limb, character).allowed).toBe(true);
  });

  it('blocks null limb', () => {
    const result = canReplaceLimb('leftArm', null, character);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('equip.error.noLimb');
  });
});
