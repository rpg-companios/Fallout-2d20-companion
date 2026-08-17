/**
 * Комплект «NIGHTKIN» (ориджин «Тень» / shadow).
 *
 * Состав (решения владельца, 2026-08-15):
 *  - лазерная винтовка (weapon_laser_gun + стандартная ложа mod_058) + 8+6{/CD} Energy Cells;
 *  - Bumper Sword (weapon_bumper_sword): урон 6, Piercing 1, Physical,
 *    Recoil (7), Two-Handed, вес 12, цена 125, rarity 2;
 *  - броня рейдера: нагрудник + рука + нога (стандартный тир);
 *  - Stealth Boy — данных нет, будет добавлен позже;
 *  - 2 броска по таблице еды (food) + 1 бросок по таблице напитков (brewery).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';

beforeAll(() => {
  setCurrentLocale('ru-RU');
  setCurrentModuleLocale('ru-RU');
});

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

const KIT_ID = 'nightkin';
const getOrigin = () => moduleOrigins.find((o) => o.id === 'shadow');

describe('Комплект NIGHTKIN: данные', () => {
  it('ориджин «Тень» ссылается на комплект nightkin', () => {
    expect(getOrigin().equipmentKitIds).toEqual([KIT_ID]);
  });

  it('имя локализовано: ru «Тень», en «NIGHTKIN»', () => {
    expect(getEquipmentCatalogForLocale('ru-RU').equipmentKits[KIT_ID].name).toBe('Тень');
    expect(getEquipmentCatalogForLocale('en-EN').equipmentKits[KIT_ID].name).toBe('NIGHTKIN');
  });

  it('все id предметов существуют в каталоге', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const items = catalog.equipmentKits[KIT_ID].items;

    const laser = items.find((i) => i.weaponId === 'weapon_laser_gun');
    expect(laser).toBeDefined();
    expect(laser.modIds).toContain('mod_058');
    expect(laser.ammo.ammoId).toBe('ammo_energy_cell');
    expect(laser.ammo.quantity).toMatchObject({ base: 8, rollType: 'rollCD', rollValue: 6, op: '+' });
    // ложа существует и подходит лазерному пистолету
    const stock = catalog.weaponMods.find((m) => m.id === 'mod_058');
    expect(stock).toBeDefined();
    expect(stock.applies_to_ids).toContain('weapon_laser_gun');

    // оружие
    expect(catalog.weapons.some((w) => w.id === 'weapon_laser_gun')).toBe(true);
    const bumper = catalog.weapons.find((w) => w.id === 'weapon_bumper_sword');
    expect(bumper).toBeDefined();
    expect(bumper.damage).toBe(6);
    expect(bumper.damageType).toBe('physical');
    expect(bumper.qualities).toContainEqual({ qualityId: 'quality_recoil_x', value: 7 });
    expect(bumper.qualities).toContainEqual({ qualityId: 'quality_two-handed' });
    expect(bumper.effects).toContainEqual({ effectId: 'effect_piercing_x', value: 1 });
    expect(bumper.weight).toBe('12');
    expect(bumper.cost).toBe(125);
    expect(bumper.rarity).toBe(2);
    // броня рейдера (стандартный тир)
    expect(catalog.armorList.some((a) => a.id === 'armor_raider_chest_001')).toBe(true);
    expect(catalog.armorList.some((a) => a.id === 'armor_raider_hand_001')).toBe(true);
    expect(catalog.armorList.some((a) => a.id === 'armor_raider_leg_001')).toBe(true);
    // патроны
    expect(catalog.ammoTypes.some((a) => a.id === 'ammo_energy_cell')).toBe(true);
    // Стелс-бой: расходник (chem), +2 к защите на 1 сцену, зависимость
    const stealthBoy = catalog.chems.find((c) => c.id === 'chem_stealth_boy');
    expect(stealthBoy).toBeDefined();
    expect(stealthBoy.positiveEffect.defenseModifier).toEqual({ op: '+', value: 2 });
    expect(stealthBoy.positiveEffectDuration).toBe('lasting'); // 1 сцена
    expect(stealthBoy.addictionLevel).toBe(1);
    expect(stealthBoy.negativeEffect).toBe('addiction');
    expect(stealthBoy.weight).toBe(1);
    expect(stealthBoy.cost).toBe(100);
    expect(stealthBoy.rarity).toBe(3);
  });

  it('лут: 2 броска food + 1 бросок brewery', () => {
    const items = getEquipmentCatalogForLocale('ru-RU').equipmentKits[KIT_ID].items;
    const rolls = items.filter((i) => i.type === 'rollTable');
    expect(rolls).toHaveLength(2);
    expect(rolls[0].tableId).toBe('food');
    expect(rolls[0].roll).toMatchObject({ rollType: 'D20', count: 2, mode: 'separate' });
    expect(rolls[1].tableId).toBe('brewery');
    expect(rolls[1].roll).toMatchObject({ rollType: 'D20', count: 1, mode: 'separate' });
  });
});

describe('Комплект NIGHTKIN: резолв', () => {
  it('лазерная винтовка: laser gun + стандартная ложа, 8+6{/CD} энергоячеек', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const resolved = await resolveKitItems({
      id: KIT_ID,
      items: catalog.equipmentKits[KIT_ID].items,
    });
    const ids = resolved.items.map((i) => i.weaponId || i.armorId || i.itemId || i.id);
    expect(ids).toContain('weapon_laser_gun');
    expect(ids).toContain('weapon_bumper_sword');
    expect(ids).toContain('armor_raider_chest_001');
    expect(ids).toContain('armor_raider_hand_001');
    expect(ids).toContain('armor_raider_leg_001');
    expect(ids).toContain('chem_stealth_boy');

    const rifle = resolved.items.find((i) => i.weaponId === 'weapon_laser_gun');
    expect(rifle).toBeDefined();
    expect(rifle.appliedMods).toMatchObject({ Stocks: 'mod_058' });
    // ложа превращает пистолет в винтовку (stockNames.with из i18n)
    expect(rifle.displayName).toContain('Лазерная винтовка');
    expect(rifle.resolvedAmmunition?.id).toBe('ammo_energy_cell');
    expect(rifle.resolvedAmmunition?.quantity).toBeGreaterThanOrEqual(8);
    expect(rifle.resolvedAmmunition?.quantity).toBeLessThanOrEqual(14);
  });
});
