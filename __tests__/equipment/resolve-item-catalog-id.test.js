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
