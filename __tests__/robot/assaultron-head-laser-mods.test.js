// Предохранитель данных: уникальные моды Головного лазера Штурмотрона.
//
// Слово владельца (2026-09-21): добавить уникальные моды для Головного лазера
// Штурмотрона — именно «Головной лазер» (не «Лазер головы» и никак иначе;
// английское название не меняется). Это оружие роботов, моды подходят только
// к «robot_weapon_assaultron_head_laser» и живут отдельно от оружия.
// Оперировать только данными: файл модов оружия роботов создан по аналогии
// с оружием людей (weapon_mods.json + weapon_mod_slots.json + i18n ru/en).
//
// Таблица (источник — правила):
//   Mk III: +1 DC, 3 заряда/атаку, вес —,   cost +4,  Robotics Expert
//   Mk IV:  +2 DC, 4 заряда/атаку, вес +1,  cost +8,  Robotics Expert, Science! 1
//   Mk V:   +3 DC, 5 зарядов/атаку, вес +1,  cost +12, Robotics Expert, Science! 2
//   Mk VI:  +4 DC, 6 зарядов/атаку, вес +2,  cost +16, Robotics Expert, Science! 3
// «Robotics Expert» без ранга в таблице записан как ранг 1 — по конвенции
// данных оружия роботов («Robotics Expert 1»).

import { describe, it, expect } from 'vitest';
import robotWeaponMods from '../../modules/fallout/data/equipment/robot/weapon_mods.json';
import robotWeaponModSlots from '../../modules/fallout/data/equipment/robot/weapon_mod_slots.json';
import ruWeaponMods from '../../modules/fallout/i18n/ru-RU/data/equipment/robot/weapon_mods.json';
import enWeaponMods from '../../modules/fallout/i18n/en-EN/data/equipment/robot/weapon_mods.json';
import ruRobotWeapons from '../../modules/fallout/i18n/ru-RU/data/equipment/robot/weapons.json';
import enRobotWeapons from '../../modules/fallout/i18n/en-EN/data/equipment/robot/weapons.json';
import robotWeaponsData from '../../modules/fallout/data/equipment/robot/weapons.json';
import { getRobotLimbCatalog } from '../../domain/registry';

const LASER_ID = 'robot_weapon_assaultron_head_laser';

const EXPECTED = [
  { suffix: 'mk_iii', damage: 1, ammoPerAttack: 3, weight: 0, cost: 4, perk2: '' },
  { suffix: 'mk_iv', damage: 2, ammoPerAttack: 4, weight: 1, cost: 8, perk2: 'Science! 1' },
  { suffix: 'mk_v', damage: 3, ammoPerAttack: 5, weight: 1, cost: 12, perk2: 'Science! 2' },
  { suffix: 'mk_vi', damage: 4, ammoPerAttack: 6, weight: 2, cost: 16, perk2: 'Science! 3' },
];

const modId = (suffix) => `robot_weapon_mod_assaultron_head_laser_capacitor_${suffix}`;
const MARK = { mk_iii: 'Mk III', mk_iv: 'Mk IV', mk_v: 'Mk V', mk_vi: 'Mk VI' };
const byId = (list, id) => list.find((entry) => entry.id === id);

describe('уникальные моды Головного лазера Штурмотрона (слово владельца 2026-09-21)', () => {
  it('оружие-хозяин существует и это оружие роботов', () => {
    const laser = byId(robotWeaponsData, LASER_ID);
    expect(laser).toBeTruthy();
    expect(laser.itemType).toBe('weapon');
  });

  it('ровно четыре конденсатора, все уникальные и только для лазера', () => {
    expect(robotWeaponMods).toHaveLength(4);
    for (const mod of robotWeaponMods) {
      expect(mod.unique).toBe(true);
      expect(mod.modType).toBe('weapon');
      expect(mod.applies_to_ids).toEqual([LASER_ID]);
      expect(mod.slot).toBe('Capacitor');
    }
  });

  it.each(EXPECTED)('мод $suffix: значения из таблицы правил', ({ suffix, damage, ammoPerAttack, weight, cost, perk2 }) => {
    const mod = byId(robotWeaponMods, modId(suffix));
    expect(mod, `нет мода ${modId(suffix)}`).toBeTruthy();
    expect(mod.damageModifier).toEqual({ op: '+', value: damage });
    expect(mod.ammoPerAttack).toBe(ammoPerAttack);
    // Плоские аддитивные cost/weight — конвенция конвейера applyWeaponMods
    // (domain/enrichItem.js: weight += mod.weight; cost += mod.cost).
    expect(mod.weight).toBe(weight);
    expect(mod.cost).toBe(cost);
    expect(mod.perk1).toBe('Robotics Expert 1');
    expect(mod.perk2).toBe(perk2);
  });

  it('реестр знает: пул weaponMods содержит конденсаторы, слоты и список — на месте', () => {
    const catalog = getRobotLimbCatalog();
    for (const mod of robotWeaponMods) {
      expect(catalog.weaponMods.some((m) => m?.id === mod.id), `${mod.id} в пуле weaponMods`).toBe(true);
    }
    expect(catalog.robotWeaponMods).toEqual(robotWeaponMods);
    expect(catalog.robotWeaponModSlots).toEqual(robotWeaponModSlots);
  });

  it('слоты: у лазера один слот Capacitor со всеми четырьмя модами', () => {
    const slots = robotWeaponModSlots[LASER_ID];
    expect(Object.keys(slots)).toEqual(['Capacitor']);
    expect(slots.Capacitor).toEqual(EXPECTED.map(({ suffix }) => modId(suffix)));
  });

  it('i18n ru: имена «Конденсатор Mk III–VI», префиксы Mk, эффекты с зарядами', () => {
    for (const { suffix, damage, ammoPerAttack } of EXPECTED) {
      const entry = byId(ruWeaponMods, modId(suffix));
      expect(entry, `нет ru i18n для ${suffix}`).toBeTruthy();
      expect(entry.name).toBe(`Конденсатор ${MARK[suffix]}`);
      expect(entry.prefix).toBe(MARK[suffix]);
      expect(entry.effectDescription).toContain(`+${damage} {/CD}`);
      expect(entry.effectDescription).toContain(`${ammoPerAttack} заряд`);
    }
  });

  it('i18n en: имена Capacitor Mk III–VI (английское название не меняется)', () => {
    for (const { suffix } of EXPECTED) {
      const entry = byId(enWeaponMods, modId(suffix));
      expect(entry, `нет en i18n для ${suffix}`).toBeTruthy();
      const mark = MARK[suffix];
      expect(entry.name).toBe(`Capacitor ${mark}`);
      expect(entry.prefix).toBe(mark);
      expect(entry.effectDescription).toContain('Damage');
      expect(entry.effectDescription).toContain('shots per attack');
    }
  });

  it('имя оружия: ru — «Головной лазер Штурмотрона», en — не тронуто', () => {
    expect(byId(ruRobotWeapons, LASER_ID).name).toBe('Головной лазер Штурмотрона');
    expect(byId(enRobotWeapons, LASER_ID).name).toBe('Assaultron Head Laser');
  });

  it('каждый мод из данных имеет i18n в обоих языках (полнота)', () => {
    for (const mod of robotWeaponMods) {
      expect(byId(ruWeaponMods, mod.id), `ru i18n для ${mod.id}`).toBeTruthy();
      expect(byId(enWeaponMods, mod.id), `en i18n для ${mod.id}`).toBeTruthy();
    }
  });
});
