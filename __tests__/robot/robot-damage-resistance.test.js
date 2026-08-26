// __tests__/robot/robot-damage-resistance.test.js
// Юнит-тесты расчёта итоговой СУ слота робота (domain/robotDamageResistance.js).
// Модуль чистый (не тянет modules/fallout) — тестируется на синтетических слотах.
import { describe, it, expect } from 'vitest';
import {
  getLimbDamageResistance,
  getActiveRobotLayers,
  getRobotSlotDamageResistance,
} from '../../domain/robotDamageResistance';

const armWithDr = {
  id: 'robot_arm_robobrain',
  itemType: 'robotArm',
  physicalDR: 2,
  energyDR: 3,
  radDR: 0,
};
const teslaArm = {
  id: 'robot_weapon_tesla_arm',
  itemType: 'robotArm',
  // рука-оружие без СУ
};
const armorFactoryArms = {
  id: 'robot_armor_factory_arms',
  layer: 'armor',
  damageResistance: { physical: 1, energy: 1 },
};
const frameHydraulicArms = {
  id: 'robot_frame_hydraulic_arms',
  layer: 'frame',
  damageResistance: { physical: 3, energy: 3 },
};
const platingToxicArms = {
  id: 'robot_plating_toxic_arms',
  layer: 'plating',
  damageResistance: { physical: 2, energy: 0 },
  incompatibleLayers: ['armor', 'frame'],
};

const makeSlot = (overrides = {}) => ({
  limb: armWithDr,
  armor: null,
  plating: null,
  frame: null,
  ...overrides,
});

describe('getLimbDamageResistance', () => {
  it('читает DR конечности', () => {
    expect(getLimbDamageResistance(armWithDr)).toEqual({ physical: 2, energy: 3, rad: 0 });
  });
  it('возвращает нули для руки-оружия без СУ', () => {
    expect(getLimbDamageResistance(teslaArm)).toEqual({ physical: 0, energy: 0, rad: 0 });
  });
});

describe('getActiveRobotLayers', () => {
  it('броня и рама совместимы между собой', () => {
    const slot = makeSlot({ armor: armorFactoryArms, frame: frameHydraulicArms });
    const active = getActiveRobotLayers(slot);
    expect(active.map((a) => a.key)).toEqual(['armor', 'frame']);
  });
  it('обшивка конфликтует с бронёй и рамой — остаётся только обшивка', () => {
    const slot = makeSlot({ armor: armorFactoryArms, frame: frameHydraulicArms, plating: platingToxicArms });
    const active = getActiveRobotLayers(slot);
    expect(active.map((a) => a.key)).toEqual(['armor', 'frame']);
  });
  it('когда есть только обшивка — она активна', () => {
    const slot = makeSlot({ plating: platingToxicArms });
    const active = getActiveRobotLayers(slot);
    expect(active.map((a) => a.key)).toEqual(['plating']);
  });
});

describe('getRobotSlotDamageResistance', () => {
  it('рука-оружие без СУ и без слоёв = 0/0/0', () => {
    const slot = makeSlot({ limb: teslaArm });
    expect(getRobotSlotDamageResistance(slot)).toEqual({ physical: 0, energy: 0, rad: 0 });
  });

  it('конечность + броня + рама суммируются', () => {
    const slot = makeSlot({ armor: armorFactoryArms, frame: frameHydraulicArms });
    // limb 2/3/0 + armor 1/1 + frame 3/3 = 6/7/0
    expect(getRobotSlotDamageResistance(slot)).toEqual({ physical: 6, energy: 7, rad: 0 });
  });

  it('обшивка в конфликте с бронёй/рамой не суммируется с ними', () => {
    const slot = makeSlot({ armor: armorFactoryArms, frame: frameHydraulicArms, plating: platingToxicArms });
    // активны armor+frame (обшивка отброшена) → 6/7/0, без +2
    expect(getRobotSlotDamageResistance(slot)).toEqual({ physical: 6, energy: 7, rad: 0 });
  });

  it('только обшивка добавляется к конечности', () => {
    const slot = makeSlot({ plating: platingToxicArms });
    // limb 2/3/0 + plating 2/0 = 4/3/0
    expect(getRobotSlotDamageResistance(slot)).toEqual({ physical: 4, energy: 3, rad: 0 });
  });

  it('не ломается на пустом слоте', () => {
    expect(getRobotSlotDamageResistance(null)).toEqual({ physical: 0, energy: 0, rad: 0 });
    expect(getRobotSlotDamageResistance({})).toEqual({ physical: 0, energy: 0, rad: 0 });
  });
});
