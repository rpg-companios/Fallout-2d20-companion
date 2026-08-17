/**
 * Разделение движок/сеттинг (патч 70): еда, напитки и моды оружия перенесены
 * в модуль ЦЕЛИКОМ (полные записи + i18n-имена). data/ для этих категорий —
 * пустая движковая база.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleFood from '../../modules/fallout/data/consumables/food.json';
import moduleDrinks from '../../modules/fallout/data/consumables/drinks.json';
import moduleWeaponMods from '../../modules/fallout/data/equipment/weapon_mods.json';
import dataFood from '../../data/consumables/food.json';
import dataDrinks from '../../data/consumables/drinks.json';
import dataWeaponMods from '../../data/equipment/weapon_mods.json';

beforeAll(() => {
  setCurrentLocale('ru-RU');
  setCurrentModuleLocale('ru-RU');
});

describe('Данные в модуле (сеттинг), data/ — пустой движок', () => {
  it('модуль содержит полные записи еды/напитков/модов', () => {
    expect(moduleFood.length).toBe(75);
    expect(moduleFood[0]).toHaveProperty('weight');
    expect(moduleFood[0]).toHaveProperty('positiveEffect.hpModifier');
    expect(moduleFood[0]).toHaveProperty('state');
    expect(moduleFood[0]).toHaveProperty('preserved');
    expect(moduleDrinks.length).toBe(22);
    expect(moduleDrinks[0]).toHaveProperty('cost');
    expect(moduleWeaponMods.length).toBe(204);
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
    expect(catalog.food.length).toBe(75);
    expect(catalog.drinks.length).toBe(22);
    expect(catalog.weaponMods.length).toBe(204);
    // флаги на месте
    expect(catalog.drinks.find((d) => d.id === 'drink_beer').isAlcohol).toBe(true);
    expect(catalog.drinks.find((d) => d.id === 'drink_nuka_cola').isAlcohol).toBe(false);
    expect(catalog.food.find((f) => f.id === 'food_brahmin_meat').state).toBe('raw');
    expect(catalog.food.find((f) => f.id === 'food_blamco_mac_and_cheese').preserved).toBe(true);
    // имена из i18n модуля
    expect(catalog.food.find((f) => f.id === 'food_carrot').name).toBe('Морковь');
    expect(catalog.food.find((f) => f.id === 'food_mutant_hound_ribs').description).toBe('Лечит 2 урона от радиации');
    expect(catalog.drinks.find((d) => d.id === 'drink_beer').name).toBe('Пиво');
    // моды: 10-мм ПП принимает моды ПП
    const smgMod = catalog.weaponMods.find((m) => m.id === 'mod_001');
    expect(smgMod.applies_to_ids).toContain('weapon_10mm_smg');
    expect(smgMod.name).toBeTruthy();
    expect(smgMod.prefix).toBeDefined();
  });
});
