import { describe, it, expect, beforeAll } from 'vitest';

import { setCurrentLocale } from '../../i18n/locale';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { resolveItem } from '../../domain/resolveItem';

beforeAll(() => setCurrentLocale('ru-RU'));

describe('resolveItem catalog enrichment', () => {
  it('uses weaponId as the catalog id for normalized inventory weapon instances', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const resolved = resolveItem({
      id: 'weapon_10mm_pistol__instance_without_catalog_metadata',
      weaponId: 'weapon_10mm_pistol',
      itemType: 'weapon',
      quantity: 1,
      equipped: false,
    }, catalog);

    expect(resolved.weaponId).toBe('weapon_10mm_pistol');
    expect(resolved.ammoId).toBe('ammo_10mm');
    expect(resolved.name).toBeTruthy();
    expect(resolved.weight).toBeTruthy();
  });

  it('preserves mod-overridden weapon ammo when enriching an inventory instance', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const resolved = resolveItem({
      id: 'weapon_pipe_bolt_action:Receivers=mod_013',
      weaponId: 'weapon_pipe_bolt_action',
      itemType: 'weapon',
      quantity: 1,
      equipped: true,
      appliedMods: { Receivers: 'mod_013' },
    }, catalog);

    expect(resolved.weaponId).toBe('weapon_pipe_bolt_action');
    expect(resolved.appliedMods).toEqual({ Receivers: 'mod_013' });
    expect(resolved.ammoId).toBe('ammo_50_cal');
  });

  it('computes armor mods from catalog data and stored mod state', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const base = resolveItem({
      id: 'armor_raider_chest_001',
      itemType: 'armor',
    }, catalog);
    const resolved = resolveItem({
      id: 'armor_raider_chest_001',
      itemType: 'armor',
      appliedArmorModId: 'mod_std_laminate',
    }, catalog);

    expect(resolved.appliedArmorModId).toBe('mod_std_laminate');
    expect(resolved.physicalDamageRating).toBe(Number(base.physicalDamageRating || 0) + 1);
    expect(resolved.energyDamageRating).toBe(Number(base.energyDamageRating || 0) + 1);
  });

  it('resolves power armor pieces by id (powerArmor catalog list)', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const resolved = resolveItem({
      id: 'power_armor_t45_helmet',
      itemType: 'powerArmor',
    }, catalog);
    expect(resolved.id).toBe('power_armor_t45_helmet');
    expect(resolved.name).toBeTruthy();
  });

  it('resolves robot parts by id for every robot part type', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const cases = [
      { id: 'robot_weapon_manipulator', type: 'robotArm' },
      { id: 'robot_body_mister_handy', type: 'robotBody' },
      { id: 'robot_legs_mister_handy_thruster', type: 'robotLeg' },
      { id: 'robot_head_protectron', type: 'robotHead' },
    ];
    cases.forEach(({ id, type }) => {
      const resolved = resolveItem({ id, itemType: type }, catalog);
      expect(resolved.id).toBe(id);
      expect(resolved.name).toBeTruthy();
    });
  });

  it('resolves robot parts via the generic robotPart type', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const resolved = resolveItem({
      id: 'robot_weapon_manipulator',
      itemType: 'robotPart',
    }, catalog);
    expect(resolved.id).toBe('robot_weapon_manipulator');
    expect(resolved.name).toBeTruthy();
  });
});
