import { describe, it, expect } from 'vitest';
import {
  isRobotCharacter,
  getRobotSlotKeys,
  createEmptyRobotSlots,
  initRobotSlotsSimple,
  canLimbHoldWeapon,
  isWeaponInsteadOfLimb,
  getSlotForDirection,
} from './robotEquipSimple.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const protectronManipulator = {
  id: 'robot_weapon_protectron_manipulator',
  itemType: 'weapon',
  builtinManipulator: true,
  canHoldWeapons: true,
  maxHandelWeaponWeight: 5,
};

const flamethrower = {
  id: 'robot_weapon_flamethrower',
  itemType: 'weapon',
  damage: 3,
  damageType: 'fire',
  weight: 0,
  replacesArm: true,
  blocksStandardWeapons: true,
  robotOnly: true,
};

const laserGun = {
  id: 'weapon_laser_gun',
  itemType: 'weapon',
  damage: 5,
  weight: 2,
  robotOnly: true,
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

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

describe('robotEquipSimple', () => {
  describe('isRobotCharacter', () => {
    it('возвращает true для робота', () => {
      expect(isRobotCharacter({ origin: { isRobot: true } })).toBe(true);
    });

    it('возвращает false для человека', () => {
      expect(isRobotCharacter({ origin: { isRobot: false } })).toBe(false);
    });
  });

  describe('getRobotSlotKeys', () => {
    it('возвращает слоты для protectron', () => {
      expect(getRobotSlotKeys('protectron')).toEqual([
        'head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg',
      ]);
    });

    it('возвращает слоты для misterHandy', () => {
      expect(getRobotSlotKeys('misterHandy')).toEqual([
        'head', 'body', 'arm1', 'arm2', 'arm3', 'thruster',
      ]);
    });
  });

  describe('createEmptyRobotSlots', () => {
    it('создает пустые слоты для protectron', () => {
      const slots = createEmptyRobotSlots('protectron');
      expect(Object.keys(slots)).toEqual([
        'head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg',
      ]);
      
      for (const slot of Object.values(slots)) {
        expect(slot).toEqual({
          limb: null,
          armor: null,
          plating: null,
          frame: null,
          heldWeapon: null,
        });
      }
    });
  });

  describe('initRobotSlotsSimple', () => {
    it('обрабатывает оружие с replacesArm как конечность', () => {
      const resolvedItems = [
        { ...flamethrower, itemType: 'weapon' },
        { ...standardPlating },
      ];

      const result = initRobotSlotsSimple('protectron', resolvedItems, robotCatalog);
      
      // Огнемёт должен стать конечностью в arm-слоте
      const armSlot = Object.entries(result.slots).find(([key, slot]) => 
        (key.includes('Arm') || key.includes('arm')) && slot.limb?.id === 'robot_weapon_flamethrower'
      );
      
      expect(armSlot).toBeTruthy();
      expect(result.weapons).toHaveLength(1);
      expect(result.weapons[0].id).toBe('robot_weapon_flamethrower');
    });

    it('обрабатывает builtinManipulator как конечность', () => {
      const resolvedItems = [
        { ...protectronManipulator, itemType: 'weapon' },
        { ...laserGun, itemType: 'weapon', robotOnly: true },
      ];

      const result = initRobotSlotsSimple('protectron', resolvedItems, robotCatalog);
      
      // Манипулятор должен стать конечностью
      const armSlot = Object.entries(result.slots).find(([key, slot]) => 
        (key.includes('Arm') || key.includes('arm')) && slot.limb?.id === 'robot_weapon_protectron_manipulator'
      );
      
      expect(armSlot).toBeTruthy();
      
      // Лазерная пушка должна быть heldWeapon
      const hasLaser = Object.values(result.slots).some(slot => 
        slot.heldWeapon?.id === 'weapon_laser_gun'
      );
      
      expect(hasLaser).toBe(true);
    });

    it('заполняет голову/тело/ноги из каталога', () => {
      const resolvedItems = [
        { ...protectronManipulator, itemType: 'weapon' },
      ];

      const result = initRobotSlotsSimple('protectron', resolvedItems, robotCatalog);
      
      expect(result.slots.head.limb?.id).toBe('robot_head_protectron');
      expect(result.slots.body.limb?.id).toBe('robot_body_protectron');
      expect(result.slots.leftLeg.limb?.id).toBe('robot_leg_protectron');
      expect(result.slots.rightLeg.limb?.id).toBe('robot_leg_protectron');
    });

    it('распределяет броню по локациям', () => {
      const resolvedItems = [
        { ...standardPlating, robotLocation: 'Main Body' },
        { ...standardPlating, robotLocation: 'Arms', id: 'robot_plating_arms' },
      ];

      const result = initRobotSlotsSimple('protectron', resolvedItems, robotCatalog);
      
      expect(result.slots.body.plating?.id).toBe('robot_plating_standard_body');
      expect(result.slots.leftArm.plating?.id).toBe('robot_plating_arms');
      expect(result.slots.rightArm.plating?.id).toBe('robot_plating_arms');
    });

    it('собирает модули в отдельный список', () => {
      const resolvedItems = [
        { id: 'robot_module_recon', itemType: 'module' },
        { id: 'robot_module_hazard', itemType: 'module' },
      ];

      const result = initRobotSlotsSimple('protectron', resolvedItems, robotCatalog);
      
      expect(result.modules).toHaveLength(2);
      expect(result.modules.map(m => m.id)).toContain('robot_module_recon');
      expect(result.modules.map(m => m.id)).toContain('robot_module_hazard');
    });
  });

  describe('canLimbHoldWeapon', () => {
    it('возвращает true для конечности которая может держать оружие', () => {
      const limb = { canHoldWeapons: true };
      expect(canLimbHoldWeapon(limb)).toBe(true);
    });

    it('возвращает false для конечности которая не может держать оружие', () => {
      const limb = { canHoldWeapons: false };
      expect(canLimbHoldWeapon(limb)).toBe(false);
    });

    it('возвращает false для null/undefined', () => {
      expect(canLimbHoldWeapon(null)).toBe(false);
      expect(canLimbHoldWeapon(undefined)).toBe(false);
    });
  });

  describe('isWeaponInsteadOfLimb', () => {
    it('возвращает true для оружия с replacesArm', () => {
      const weapon = { replacesArm: true };
      expect(isWeaponInsteadOfLimb(weapon)).toBe(true);
    });

    it('возвращает true для оружия с builtinManipulator', () => {
      const weapon = { builtinManipulator: true };
      expect(isWeaponInsteadOfLimb(weapon)).toBe(true);
    });

    it('возвращает false для обычного оружия', () => {
      const weapon = { damage: 5 };
      expect(isWeaponInsteadOfLimb(weapon)).toBe(false);
    });
  });

  describe('getSlotForDirection', () => {
    it('возвращает leftArm для protectron left', () => {
      expect(getSlotForDirection('protectron', 'left')).toBe('leftArm');
    });

    it('возвращает rightArm для protectron right', () => {
      expect(getSlotForDirection('protectron', 'right')).toBe('rightArm');
    });

    it('возвращает arm1 для misterHandy left', () => {
      expect(getSlotForDirection('misterHandy', 'left')).toBe('arm1');
    });

    it('возвращает arm2 для misterHandy right', () => {
      expect(getSlotForDirection('misterHandy', 'right')).toBe('arm2');
    });
  });
});