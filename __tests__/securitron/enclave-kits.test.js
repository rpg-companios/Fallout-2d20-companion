/**
 * Комплекты «Осколка Анклава»: Бывший учёный / Бывший солдат.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

import { setCurrentLocale } from '../../i18n/locale';

beforeAll(() => setCurrentLocale('ru-RU'));

vi.mock('../../db/Database', async () => {
  const catalog = await import('../../db/catalogSource');
  return {
    getWeaponById: async (id) => catalog.catalogGetWeaponById(id),
    getWeaponModById: async (id) => catalog.catalogGetWeaponModById(id),
    getAmmoById: async (id) => catalog.catalogGetAmmoById(id),
    getItemByName: async (name) => catalog.catalogGetItemByName(name),
  };
});

import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { resolveKitItems } from '../../domain/kitResolver';
import moduleOrigins from '../../modules/fallout/data/origins/origins.json';

const KIT_IDS = ['enclave_scientist', 'enclave_soldier'];
const getOrigin = () => moduleOrigins.find((o) => o.id === 'enclaveRemnant');

describe('Комплекты Анклава: данные', () => {
  it('ориджин ссылается на оба комплекта', () => {
    expect(getOrigin().equipmentKitIds).toEqual(KIT_IDS);
  });

  it('имена комплектов локализованы', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.equipmentKits.enclave_scientist.name).toBe('Бывший учёный');
    expect(catalog.equipmentKits.enclave_soldier.name).toBe('Бывший солдат');
  });

  it('учёный: халат, противогаз, лазерный пистолет и 6+3 энергоячейки', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const resolved = await resolveKitItems({
      id: 'enclave_scientist',
      items: catalog.equipmentKits.enclave_scientist.items,
    });
    const ids = resolved.items.map((i) => i.clothingId || i.armorId || i.weaponId || i.itemId || i.id);
    expect(ids).toContain('clothing_lab_coat');
    expect(ids).toContain('headwear_gas_mask');
    expect(ids).toContain('weapon_laser_gun');

    const pistol = resolved.items.find((i) => i.weaponId === 'weapon_laser_gun');
    expect(pistol).toBeDefined();
    expect(pistol.resolvedAmmunition?.id).toBe('ammo_energy_cell');
    expect(pistol.resolvedAmmunition?.quantity).toBeGreaterThanOrEqual(6);
    expect(pistol.resolvedAmmunition?.quantity).toBeLessThanOrEqual(9);
  });

  it('солдат: военная униформа, нагрудник ББ, выбор лазерной винтовки/штурмовой винтовки с 8+4 боезапаса', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.enclave_soldier;

    // choice существует и предлагает ровно два варианта оружия
    const choice = kit.items.find((e) => e.type === 'choice');
    expect(choice).toBeDefined();
    expect(choice.items).toHaveLength(2);
    const optionIds = choice.items.map((o) => o.weaponId);
    expect(optionIds).toContain('weapon_laser_gun');
    expect(optionIds).toContain('weapon_assault_rifle');

    // Резолв лазерной винтовки (пистолет + ствольная коробка/ложа mod_058, ствол mod_054)
    const laserOption = choice.items.find((o) => o.weaponId === 'weapon_laser_gun');
    expect(laserOption.modIds).toEqual(['mod_058', 'mod_054']);

    const resolved = await resolveKitItems({ id: 'enclave_soldier', items: kit.items });
    const ids = resolved.items.map((i) => i.clothingId || i.armorId || i.weaponId || i.itemId || i.id);
    expect(ids).toContain('clothing_military_fatigues');
    expect(ids).toContain('armor_combat_chest_001');
    // один из вариантов оружия попал в комплект (по умолчанию choice — первый)
    expect(ids.some((id) => id === 'weapon_laser_gun' || id === 'weapon_assault_rifle')).toBe(true);
  });
});
