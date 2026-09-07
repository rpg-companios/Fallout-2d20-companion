// __tests__/robot/robot-kit-installed-weapons.test.js
//
// Откуда берётся оружие робота при сборке персонажа из комплекта:
//   - СВОЯ атака конечности объявляется каталогом (limb.builtinWeaponId /
//     attackId у оружия вместо руки). Никаких обратных ссылок из оружия на
//     конечность в данных больше нет.
//   - УСТАНОВЛЕННОЕ в конечность оружие (лазерная пушка Секьюритрона,
//     месметрон Робомозга) объявляет комплект: installTo: 'arm' | 'head'.
//     Оно не занимает ладонь и не лежит в инвентаре.

import { describe, it, expect } from 'vitest';

import limbs from '../../modules/fallout/data/equipment/robot/limbs.json';
import weaponAsLimb from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
import robotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';
import generalWeapons from '../../modules/fallout/data/equipment/weapons.json';
import { initRobotSlots, getBuiltinWeaponsFromSlots } from '../../domain/robotEquip';
import { serializeSlot, collectAttacks } from '../../domain/robotSlots';

const robotCatalog = { limbs, weaponAsLimb, weapons: robotWeapons };
const byId = (list, id) => list.find((entry) => entry.id === id);
const asKitWeapon = (weapon, extra = {}) => ({ ...weapon, itemType: 'weapon', weaponId: weapon.id, ...extra });

describe('данные: обратных ссылок из оружия на конечность больше нет', () => {
  it('в каталоге оружия роботов нет полей builtinTo*', () => {
    const leftovers = robotWeapons.filter((w) => 'builtinToArm' in w || 'builtinToHead' in w);
    expect(leftovers.map((w) => w.id)).toEqual([]);
  });

  it('лазер головы и месметрон принадлежат головам через builtinWeaponId', () => {
    expect(byId(limbs, 'robot_head_assaultron_laser').builtinWeaponId)
      .toBe('robot_weapon_assaultron_head_laser');
    expect(byId(limbs, 'robot_head_robobrain').builtinWeaponId)
      .toBe('robot_weapon_mesmetron');
  });

  it('дымовые когти — атака своей руки, а не установка «из воздуха»', () => {
    // Раньше weapon.builtinToArm указывал на несуществующую robot_arm_robobrain.
    const claws = byId(robotWeapons, 'robot_weapon_smoke_claws');
    expect(claws.builtinToArm).toBeUndefined();
    expect(byId(limbs, 'robot_arm_smoke_manipulator').builtinWeaponId)
      .toBe('robot_weapon_smoke_claws');
    expect(byId(limbs, 'robot_arm_robobrain')).toBeTruthy(); // рука без своей атаки — это нормально
  });
});

describe('комплект: оружие с installTo уходит в установку, а не в ладонь', () => {
  it('installTo: arm — лазерная пушка Секьюритрона становится установкой', () => {
    const laser = byId(generalWeapons, 'weapon_laser_gun');
    const { slots } = initRobotSlots('securitron', [
      asKitWeapon(laser, { slot: 'left', installTo: 'arm' }),
    ], robotCatalog);

    const left = serializeSlot(slots.leftArm);
    expect(left.content).toBe('robot_arm_securitron');
    expect(left.installedWeapons).toEqual([{ id: 'weapon_laser_gun', modIds: [] }]);
    // ладонь осталась свободной — оружие встроено, а не взято в руку
    expect(left.heldWeaponId).toBeNull();
  });

  it('без installTo оружие внутрь конечности не устанавливается', () => {
    const laser = byId(generalWeapons, 'weapon_laser_gun');
    const { slots, inventoryItems } = initRobotSlots('securitron', [
      asKitWeapon(laser, { slot: 'left' }),
    ], robotCatalog);

    // В руку оно не встраивается: без пометки это просто предмет инвентаря,
    // игрок сам решает, брать его в ладонь или нет.
    const left = serializeSlot(slots.leftArm);
    expect(left.installedWeapons).toEqual([]);
    expect(left.heldWeaponId).toBeNull();
    expect(inventoryItems.some((i) => (i.weaponId || i.id) === 'weapon_laser_gun')).toBe(true);
  });

  it('installTo: head — месметрон Робомозга уходит в голову, а не в руку', () => {
    const mesmetron = byId(robotWeapons, 'robot_weapon_mesmetron');
    const { slots } = initRobotSlots('robobrain', [
      asKitWeapon(mesmetron, { installTo: 'head' }),
    ], robotCatalog);

    expect(slots.head.limb?.id).toBe('robot_head_robobrain');
    const ids = getBuiltinWeaponsFromSlots(slots).map((w) => w.id);
    expect(ids).toContain('robot_weapon_mesmetron');
    // рука месметроном не занята
    expect(slots.leftArm.limb?.id).not.toBe('robot_weapon_mesmetron');
    expect(slots.rightArm.limb?.id).not.toBe('robot_weapon_mesmetron');
  });
});

describe('комплект Штурмотрона собирается так же, как выглядит живой сейв', () => {
  it('когти — свои, лазер — установка, лазер головы — свой', () => {
    const laser = byId(generalWeapons, 'weapon_laser_gun');
    const { slots } = initRobotSlots('assaultron', [
      asKitWeapon(laser, { slot: 'left', installTo: 'arm' }),
    ], robotCatalog);

    expect(serializeSlot(slots.leftArm)).toMatchObject({
      content: 'robot_arm_assaultron',
      installedWeapons: [{ id: 'weapon_laser_gun', modIds: [] }],
    });
    // правая рука — без установки
    expect(serializeSlot(slots.rightArm).installedWeapons).toEqual([]);

    const cards = collectAttacks(slots);
    expect(cards.map((c) => c.id).sort()).toEqual([
      'robot_weapon_assaultron_head_laser',
      'robot_weapon_claw',
      'robot_weapon_claw',
      'weapon_laser_gun',
    ].sort());
  });
});
