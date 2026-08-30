// __tests__/robot/assaultron-kits.test.js
// Комплекты снаряжения Штурмотрона (Wanderer's Guide):
//  - комплект существует и привязан к ориджину;
//  - комплект выдаёт голову с лазером — у головы есть встроенное оружие,
//    и оно попадает в карточки оружия со статами;
//  - строительные когти — оружие: становятся конечностью со встроенным
//    оружием, у которого есть статы (урон/тип/навык) для экрана экипировки.
import { describe, it, expect } from 'vitest';

import kits from '../../modules/fallout/data/equipmentKits/index.js';
import origins from '../../modules/fallout/data/origins/origins.json';
import heads from '../../modules/fallout/data/equipment/robot/robotheads.json';
import bodies from '../../modules/fallout/data/equipment/robot/robotbody.json';
import arms from '../../modules/fallout/data/equipment/robot/robotarms.json';
import legs from '../../modules/fallout/data/equipment/robot/robotlegs.json';
import robotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';
import ruKits from '../../modules/fallout/i18n/ru-RU/data/system/equipmentKits.json';
import enKits from '../../modules/fallout/i18n/en-EN/data/system/equipmentKits.json';
import { initRobotSlots, getBuiltinWeaponsFromSlots } from '../../domain/robotEquip';

const ASSAULTRON_KIT_IDS = [
  'assaultron_us_military',
  'assaultron_devil',
  'assaultron_caravan_guard',
];

const robotCatalog = { heads, bodies, arms, legs, weapons: robotWeapons };

const byId = (list, id) => list.find((entry) => entry.id === id);

describe('комплекты снаряжения Штурмотрона', () => {
  it('ориджин assaultron ссылается на три комплекта, и все они существуют', () => {
    const origin = origins.find((o) => o.id === 'assaultron');
    expect(origin.equipmentKitIds).toEqual(ASSAULTRON_KIT_IDS);
    for (const kitId of ASSAULTRON_KIT_IDS) {
      expect(kits[kitId], `нет комплекта ${kitId}`).toBeTruthy();
      expect(Array.isArray(kits[kitId].items)).toBe(true);
      expect(ruKits[kitId]?.name, `нет ru-имени ${kitId}`).toBeTruthy();
      expect(enKits[kitId]?.name, `нет en-имени ${kitId}`).toBeTruthy();
    }
  });

  it('каждый комплект выдаёт голову с лазером', () => {
    for (const kitId of ASSAULTRON_KIT_IDS) {
      const hasLaserHead = kits[kitId].items.some(
        (item) => item.itemId === 'robot_head_assaultron_laser' && item.itemType === 'robotHead',
      );
      expect(hasLaserHead, `${kitId} не выдаёт голову с лазером`).toBe(true);
    }
  });

  it('у головы с лазером есть встроенное оружие (лазер головы)', () => {
    const head = byId(heads, 'robot_head_assaultron_laser');
    expect(head.builtinWeaponId).toBe('robot_weapon_assaultron_head_laser');
    const laser = byId(robotWeapons, 'robot_weapon_assaultron_head_laser');
    expect(laser.damage).toBeGreaterThan(0);
    expect(laser.damageType).toBe('energy');
  });

  it('initRobotSlots: голова из комплекта даёт карточку лазера со статами', () => {
    const head = byId(heads, 'robot_head_assaultron_laser');
    const { slots } = initRobotSlots('assaultron', [{ ...head }], robotCatalog);
    const weapons = getBuiltinWeaponsFromSlots(slots);
    const laser = weapons.find((w) => w.id === 'robot_weapon_assaultron_head_laser');
    expect(laser, 'лазер головы не попал в оружие').toBeTruthy();
    expect(laser.damage).toBe(5);
    expect(laser.damageType).toBe('energy');
    expect(laser.mainSkill).toBe('ENERGY_WEAPONS');
    expect(laser.isBuiltin).toBe(true);
  });

  it('initRobotSlots: строительные когти — оружие со статами в слотах рук', () => {
    const clawWeapon = byId(robotWeapons, 'robot_weapon_construction_claw');
    const kitItems = [
      { ...clawWeapon, itemType: 'weapon', weaponId: clawWeapon.id, slot: 'left' },
      { ...clawWeapon, itemType: 'weapon', weaponId: clawWeapon.id, slot: 'right' },
    ];
    const { slots } = initRobotSlots('assaultron', kitItems, robotCatalog);

    expect(slots.leftArm.limb?.id).toBe('robot_weapon_construction_claw');
    expect(slots.rightArm.limb?.id).toBe('robot_weapon_construction_claw');

    const weapons = getBuiltinWeaponsFromSlots(slots);
    const claw = weapons.find((w) => w.id === 'robot_weapon_construction_claw');
    expect(claw, 'коготь не попал в оружие').toBeTruthy();
    expect(claw.damage).toBe(4);
    expect(claw.damageType).toBe('physical');
    expect(claw.mainSkill).toBe('UNARMED');
    expect(claw.isBuiltin).toBe(true);
  });

  it('initRobotSlots: рамы и обшивка — 1 предмет = 1 слот (включая ноги)', () => {
    const kitItems = [
      {
        id: 'robot_frame_actuated_body',
        itemType: 'robotFrame',
        layer: 'frame',
        robotLocation: 'Main Body',
        damageResistance: { physical: 1, energy: 1 },
      },
      {
        id: 'robot_plating_standard_thruster',
        itemType: 'plating',
        layer: 'plating',
        robotLocation: 'Thruster',
        damageResistance: { physical: 2, energy: 0 },
      },
      {
        id: 'robot_plating_standard_thruster_2',
        itemType: 'plating',
        layer: 'plating',
        robotLocation: 'Thruster',
        damageResistance: { physical: 2, energy: 0 },
      },
    ];
    const { slots, inventoryItems } = initRobotSlots('assaultron', kitItems, robotCatalog);
    expect(slots.body.frame?.id).toBe('robot_frame_actuated_body');
    // Локация Thruster у штурмотрона — ноги, 1 предмет = 1 слот
    // Первый thruster → leftLeg, второй → rightLeg (первый свободный)
    expect(slots.leftLeg.plating?.id).toBe('robot_plating_standard_thruster');
    expect(slots.rightLeg.plating?.id).toBe('robot_plating_standard_thruster_2');
    expect(inventoryItems).toHaveLength(0);
  });

  it('initRobotSlots: Arms — 1 предмет = 1 слот руки', () => {
    const kitItems = [
      {
        id: 'robot_frame_actuated_arms',
        itemType: 'robotFrame',
        layer: 'frame',
        robotLocation: 'Arms',
        damageResistance: { physical: 1, energy: 1 },
      },
    ];
    const { slots } = initRobotSlots('assaultron', kitItems, robotCatalog);
    // Один предмет Arms должен занять только leftArm, а не обе руки
    expect(slots.leftArm.frame?.id).toBe('robot_frame_actuated_arms');
    expect(slots.rightArm.frame).toBeFalsy();
  });

  it('initRobotSlots: defaultPlating из bodyPlan — стандартная обшивка на основании данных', () => {
    // Пустой комплект — должны подтянуться дефолты из bodyPlan.defaultPlating
    const { slots } = initRobotSlots('assaultron', [], {
      ...robotCatalog,
      plating: [
        { id: 'robot_plating_standard_optics', layer: 'plating', robotLocation: 'Optics', damageResistance: { physical: 2, energy: 0 } },
        { id: 'robot_plating_standard_body', layer: 'plating', robotLocation: 'Main Body', damageResistance: { physical: 2, energy: 0 } },
        { id: 'robot_plating_standard_arms', layer: 'plating', robotLocation: 'Arms', damageResistance: { physical: 2, energy: 0 } },
        { id: 'robot_plating_standard_thruster', layer: 'plating', robotLocation: 'Thruster', damageResistance: { physical: 2, energy: 0 } },
      ],
      frames: [],
    });
    expect(slots.head.plating?.id).toBe('robot_plating_standard_optics');
    expect(slots.body.plating?.id).toBe('robot_plating_standard_body');
    expect(slots.leftArm.plating?.id).toBe('robot_plating_standard_arms');
    expect(slots.rightArm.plating?.id).toBe('robot_plating_standard_arms');
    expect(slots.leftLeg.plating?.id).toBe('robot_plating_standard_thruster');
    expect(slots.rightLeg.plating?.id).toBe('robot_plating_standard_thruster');
  });
});
