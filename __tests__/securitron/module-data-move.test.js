/**
 * Разделение движок/сеттинг (патч 70): еда, напитки и моды оружия перенесены
 * в модуль ЦЕЛИКОМ (полные записи + i18n-имена). data/ для этих категорий —
 * пустая движковая база.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale } from '../../i18n/locale';
import moduleFood from '../../modules/fallout/data/food.json';
import moduleDrinks from '../../modules/fallout/data/drinks.json';
import moduleWeaponMods from '../../modules/fallout/data/weapon_mods.json';
import dataFood from '../../data/consumables/food.json';
import dataDrinks from '../../data/consumables/drinks.json';
import dataWeaponMods from '../../data/equipment/weapon_mods.json';

beforeAll(() => {
  setCurrentLocale('ru-RU');
});

describe('Данные в модуле (сеттинг), data/ — пустой движок', () => {
  it('модуль содержит полные записи еды/напитков/модов', () => {
    expect(moduleFood.length).toBe(76);
    expect(moduleFood[0]).toHaveProperty('weight');
    expect(moduleFood[0]).toHaveProperty('hpHealed');
    expect(moduleDrinks.length).toBe(22);
    expect(moduleDrinks[0]).toHaveProperty('cost');
    expect(moduleWeaponMods.length).toBe(203);
    expect(moduleWeaponMods[0]).toHaveProperty('slot');
    expect(moduleWeaponMods[0]).toHaveProperty('applies_to_ids');
  });

  it('data/ для этих категорий пуста (движок без сеттинга)', () => {
    expect(dataFood).toEqual([]);
    expect(dataDrinks).toEqual([]);
    expect(dataWeaponMods).toEqual([]);
  });

  it('каталог отдаёт полные данные из модуля с флагами', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.food.length).toBe(76);
    expect(catalog.drinks.length).toBe(22);
    expect(catalog.weaponMods.length).toBe(204);
    // флаги на месте
    expect(catalog.drinks.find((d) => d.id === 'drink_beer').isAlcohol).toBe(true);
    expect(catalog.drinks.find((d) => d.id === 'drink_nuka_cola').isAlcohol).toBe(false);
    expect(catalog.food.find((f) => f.id === 'food_brahmin_meat').isMeat).toBe(true);
    expect(catalog.food.find((f) => f.id === 'food_carrot').isMeat).toBe(false);
    // имена из i18n модуля
    expect(catalog.food.find((f) => f.id === 'food_carrot').name).toBe('Морковь');
    expect(catalog.drinks.find((d) => d.id === 'drink_beer').name).toBe('Пиво');
    // моды: 10-мм ПП принимает моды ПП
    const smgMod = catalog.weaponMods.find((m) => m.id === 'mod_001');
    expect(smgMod.applies_to_ids).toContain('weapon_10mm_smg');
    expect(smgMod.name).toBeTruthy();
    expect(smgMod.prefix).toBeDefined();
  });
});
