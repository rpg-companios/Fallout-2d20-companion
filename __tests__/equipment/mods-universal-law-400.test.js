// ПРИЁМОЧНЫЙ (патч 400): «мы делаем универсальное приложение… поведение
// модов же универсально» (владелец). Один закон для всех семей модов:
// те же правила «бутылок» (пачка, связка «хост+слот», сирота — в пачку,
// анти-двоение) действуют для броняных и одёжных модов — по их именным
// слотам на предмете (appliedArmorModId / appliedUniqueArmorModId /
// appliedClothingModId). Связки robotSlot: не судятся сверкой — их
// освобождает замена конечности (releaseRobotSlotMods, 359).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { syncWeaponModInstances } from '../../domain/weaponModInstances';
import weaponCatalog from '../../modules/fallout/data/equipment/weapon_mods.json';
import armorCatalog from '../../modules/fallout/data/equipment/armor_mods.json';
import uniqCatalog from '../../modules/fallout/data/equipment/uniq_armor_mods.json';

// Как в точке чтения сейва (400): оружейные + броняные + уникальные.
const modIds = new Set([
  ...weaponCatalog.map((m) => m.id),
  ...armorCatalog.map((m) => m.id),
  ...uniqCatalog.map((m) => m.id),
]);
// Настоящие id каталога (не фикстуры): мод и уникальный мод брони.
const ARMOR_MOD = 'mod_std_soft_padding';
const UNIQ_MOD = 'uniq_leather_boiled';

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('патч 400: один закон модов для всех семей', () => {
  it('броня: поле appliedArmorModId без записи → запись создаётся; повтор — ничего', () => {
    const state = { items: {
      armor1: { id: 'armor1', weaponId: 'armor_leather_chest_001', itemType: 'armor', appliedArmorModId: ARMOR_MOD },
    } };
    syncWeaponModInstances(state, modIds);
    const bound = Object.entries(state.items).filter(([, i]) => i.installedOn === 'armor1');
    expect(bound.length).toBe(1);
    expect(bound[0][1].weaponId).toBe(ARMOR_MOD);
    expect(bound[0][1].installedSlot).toBe('armor');
    const snapshot = clone(state.items);
    syncWeaponModInstances(state, modIds);
    expect(state.items).toEqual(snapshot);
  });

  it('одежда и уникальный мод: три именных слота — три записи', () => {
    const state = { items: {
      c1: {
        id: 'c1', weaponId: 'clothing_vault_jumpsuit', itemType: 'clothing',
        appliedArmorModId: ARMOR_MOD,
        appliedUniqueArmorModId: UNIQ_MOD,
      },
    } };
    syncWeaponModInstances(state, modIds);
    const bound = Object.entries(state.items).filter(([, i]) => i.installedOn === 'c1');
    expect(bound.length).toBe(2);
    expect(bound.find(([, i]) => i.installedSlot === 'armor')[1].weaponId).toBe(ARMOR_MOD);
    expect(bound.some(([, i]) => i.installedSlot === 'uniqueArmor')).toBe(true);
  });

  it('мод сняли с брони (поле очищено) — запись вернулась в пачку без памяти', () => {
    const state = { items: {
      armor1: { id: 'armor1', weaponId: 'armor_leather_chest_001', itemType: 'armor' },
      m1: { id: 'm1', weaponId: ARMOR_MOD, itemType: 'armorMod', equipped: true, installedOn: 'armor1', installedSlot: 'armor' },
    } };
    syncWeaponModInstances(state, modIds);
    expect(state.items.m1.equipped).toBe(false);
    expect(state.items.m1.installedOn).toBeUndefined();
    expect(state.items.m1.installedSlot).toBeUndefined();
  });

  it('броняный мод не двоится при повторных загрузках (создан китом)', () => {
    const state = { items: {
      armor1: { id: 'armor1', weaponId: 'armor_leather_chest_001', itemType: 'armor', appliedArmorModId: ARMOR_MOD },
    } };
    for (let run = 0; run < 3; run += 1) {
      const before = clone(state.items);
      syncWeaponModInstances(state, modIds);
      if (run > 0) expect(state.items).toEqual(before);
    }
  });

  it('связки robotSlot: не судятся сверкой (их ведёт замена конечности, 359)', () => {
    const state = { items: {
      roboMod: { id: 'roboMod', weaponId: 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v', itemType: 'weaponMod', equipped: true, installedOn: 'robotSlot:leftArm:weapon_flamer' },
    } };
    const snapshot = clone(state.items);
    syncWeaponModInstances(state, modIds);
    expect(state.items).toEqual(snapshot);
  });

  it('точка чтения: сверка получает общий набор (оружейные + броняные + уникальные)', () => {
    const src = readFileSync('src/saves/characterSaves.js', 'utf8');
    expect(src).toContain('const allModIds = new Set(weaponModIds);');
    expect(src).toContain('(catalog.armorMods || []).forEach');
    expect(src).toContain('(catalog.uniqArmorMods || []).forEach');
    expect(src).toContain('syncWeaponModInstances(migrated, allModIds)');
  });
});
