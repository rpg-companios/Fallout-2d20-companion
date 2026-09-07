// __tests__/robot/robot-data-catalogs.test.js
//
// Этап 1: новые каталоги данных (limbs.json, weaponAsLimb.json, limbType у
// брони, структурированные слоты в bodyplans.json).
//
// Каталоги пока НИКУДА не подключены — это чистые данные. Тесты здесь
// проверяют целостность данных и то, что существующий код продолжает
// читать планы тел так же, как раньше (слоты из строк стали объектами).

import { describe, it, expect } from 'vitest';

import { validateAll, LIMB_TYPES } from '../../scripts/validate-robot-data.mjs';

import limbs from '../../modules/fallout/data/equipment/robot/limbs.json';
import weaponAsLimb from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
import robotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';
import armorFile from '../../modules/fallout/data/equipment/robot/armor.json';
import platingFile from '../../modules/fallout/data/equipment/robot/armor_plating.json';
import framesFile from '../../modules/fallout/data/equipment/robot/frames.json';
import bodyplans from '../../modules/fallout/data/bodyplans/bodyplans.json';
import { getRobotSlotKeys } from '../../domain/robotEquip';

const ROOT = new URL('../../', import.meta.url).pathname;

const armorEntries = [
  ...armorFile.armor,
  ...platingFile.plating,
  ...framesFile.frames,
];

const limbIds = new Set(limbs.map((l) => l.id));
const weaponLimbIds = new Set(weaponAsLimb.map((l) => l.id));
const weaponIds = new Set(robotWeapons.map((w) => w.id));

describe('новые каталоги данных роботов', () => {
  it('валидатор не находит ошибок', () => {
    const { errors, warnings } = validateAll(ROOT);
    // Предупреждения допустимы, ошибки — нет.
    expect(errors, `ошибки валидации:\n${errors.join('\n')}`).toEqual([]);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('limbs.json и weaponAsLimb.json не пересекаются по id', () => {
    const intersection = [...weaponLimbIds].filter((id) => limbIds.has(id));
    expect(intersection).toEqual([]);
  });

  it('конечности: 29 записей четырёх типов', () => {
    expect(limbs).toHaveLength(29);
    const byType = limbs.reduce((acc, l) => {
      acc[l.limbType] = (acc[l.limbType] || 0) + 1;
      return acc;
    }, {});
    expect(byType).toEqual({ head: 7, body: 6, arm: 10, mover: 6 });
    for (const limb of limbs) {
      expect(limb.itemCategory).toBe('limb');
      expect(LIMB_TYPES).toContain(limb.limbType);
    }
  });

  it('оружие вместо конечности: 11 записей без защиты и хватки', () => {
    expect(weaponAsLimb).toHaveLength(11);
    for (const entry of weaponAsLimb) {
      expect(entry.itemCategory).toBe('weaponAsLimb');
      expect(entry.limbType).toBe('arm');
      // Поля ОТСУТСТВУЮТ, а не равны 0/false.
      expect(entry).not.toHaveProperty('physicalDR');
      expect(entry).not.toHaveProperty('energyDR');
      expect(entry).not.toHaveProperty('radDR');
      expect(entry).not.toHaveProperty('canHoldWeapons');
      expect(entry).not.toHaveProperty('weaponSlots');
      expect(weaponIds).toContain(entry.attackId);
    }
  });

  it('13 задвоенных id: оружие — в weapons.json, роль — itemCategory', () => {
    const shared = [...weaponIds].filter((id) => limbIds.has(id) || weaponLimbIds.has(id));
    expect(shared).toHaveLength(13);
    // Каждый задвоенный id ровно в одном каталоге конечностей.
    for (const id of shared) {
      const inLimbs = limbIds.has(id);
      const inWeaponLimbs = weaponLimbIds.has(id);
      expect(inLimbs !== inWeaponLimbs, `id ${id} должен быть ровно в одном каталоге`).toBe(true);
    }
    // Два манипулятора — конечности (у них есть хватка), остальные — оружие.
    expect(limbIds.has('robot_weapon_manipulator')).toBe(true);
    expect(limbIds.has('robot_weapon_protectron_manipulator')).toBe(true);
    expect(weaponLimbIds.has('robot_weapon_flamethrower')).toBe(true);
  });

  it('handheld: в ладонь можно взять только манипуляторы', () => {
    const handheld = robotWeapons.filter((w) => w.handheld).map((w) => w.id);
    expect(handheld.sort()).toEqual([
      'robot_weapon_manipulator',
      'robot_weapon_protectron_manipulator',
    ].sort());
    for (const weapon of robotWeapons) {
      expect(typeof weapon.handheld).toBe('boolean');
    }
  });

  it('броня адресуется типом конечности, а не именем слота', () => {
    // Локации («Optics», «Arms», «Thruster») из данных убраны: слой сам
    // знает свой тип конечности (limbType), а план тела — какие слоты его
    // принимают. Проверяем по именам: optics → голова, arms → рука и т.д.
    const expectedBySuffix = {
      optics: 'head',
      body: 'body',
      arms: 'arm',
      thruster: 'mover',
      legs: 'mover',
      wheel: 'mover',
    };
    for (const entry of armorEntries) {
      expect(LIMB_TYPES).toContain(entry.limbType);
      expect('robotLocation' in entry, `${entry.id}: старой локации быть не должно`).toBe(false);
      const suffix = Object.keys(expectedBySuffix).find((key) => entry.id.endsWith(`_${key}`));
      expect(suffix, `${entry.id}: не удалось определить тип по имени`).toBeTruthy();
      expect(entry.limbType, entry.id).toBe(expectedBySuffix[suffix]);
    }
  });

  it('таблица попаданий — свойство плана тела, старых hitLocations нет', () => {
    const plans = bodyplans;
    for (const [planId, plan] of Object.entries(plans)) {
      expect('hitLocations' in plan, `${planId}: старые hitLocations должны быть удалены`).toBe(false);
    }
    // hitTable есть не у всех планов (значения ждём от владельца), но у тех,
    // что есть, это массив записей с диапазоном и слотом.
    for (const [planId, plan] of Object.entries(plans)) {
      if (!Array.isArray(plan.hitTable)) continue;
      for (const row of plan.hitTable) {
        expect(row, `${planId}`).toHaveProperty('slotId');
      }
    }
  });

  it('слоты планов тел: статических возможностей слота (slotCapabilities) нет', () => {
    // Раньше план хранил capabilities: { canEquipWeapon, canEquipArmor } —
    // второй источник правды рядом с данными конечностей. Теперь способность
    // выводится движком: может ли конечность держать (canHoldWeapons) и
    // принимает ли слой защиту (slotAcceptsArmor).
    for (const [planId, plan] of Object.entries(bodyplans)) {
      expect('slotCapabilities' in plan, `${planId}`).toBe(false);
    }
  });

  it('слоты планов тел: имена не изменились, голова несъёмная', () => {
    const expectedSlots = {
      humanoid: ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
      robobrain: ['leftArm', 'head', 'rightArm', 'body', 'chassis'],
      misterHandy: ['head', 'body', 'arm1', 'arm2', 'arm3', 'thruster'],
      protectron: ['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg'],
      securitron: ['head', 'leftArm', 'body', 'rightArm', 'wheel'],
      assaultron: ['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg'],
      sentryBot: ['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg'],
    };
    for (const [planId, slots] of Object.entries(expectedSlots)) {
      expect(getRobotSlotKeys(planId), planId).toEqual(slots);
    }

    for (const [planId, plan] of Object.entries(bodyplans)) {
      for (const slot of plan.slots) {
        expect(slot.accepts.length, `${planId}.${slot.id}`).toBeGreaterThan(0);
        for (const type of slot.accepts) expect(LIMB_TYPES).toContain(type);
      }
      const head = plan.slots.find((s) => s.accepts.includes('head'));
      expect(head?.swappable, `${planId}: голова должна быть несъёмной`).toBe(false);
    }
  });

  it('hitTable есть только там, где диапазоны известны, и покрывает 1..20', () => {
    const withTable = Object.entries(bodyplans)
      .filter(([, plan]) => plan.hitTable)
      .map(([planId]) => planId);
    // Таблица есть у каждого плана: диапазоны известны для всех.
    expect(withTable.sort()).toEqual(Object.keys(bodyplans).sort());

    for (const planId of withTable) {
      const covered = [];
      for (const row of bodyplans[planId].hitTable) {
        const [from, to] = row.range;
        for (let n = from; n <= to; n += 1) covered.push(n);
      }
      expect(new Set(covered).size, `${planId}: наложения в hitTable`).toBe(covered.length);
      expect(covered.sort((a, b) => a - b), `${planId}: дыры в hitTable`)
        .toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
  });

  it('defaults планов тел резолвятся в конечности подходящего типа', () => {
    const byId = new Map([...limbs, ...weaponAsLimb].map((l) => [l.id, l]));
    for (const [planId, plan] of Object.entries(bodyplans)) {
      for (const [slotId, defaultId] of Object.entries(plan.defaults || {})) {
        if (defaultId === null) continue;
        const entry = byId.get(defaultId);
        expect(entry, `${planId}.${slotId}: нет конечности ${defaultId}`).toBeTruthy();
        const slot = plan.slots.find((s) => s.id === slotId);
        expect(slot.accepts, `${planId}.${slotId}: тип ${entry.limbType} не подходит`)
          .toContain(entry.limbType);
      }
    }
  });
});
