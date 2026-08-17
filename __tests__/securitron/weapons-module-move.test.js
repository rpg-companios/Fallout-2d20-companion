/**
 * Разделение движок/сеттинг (патч 102): оружие перенесено в модуль
 * ЦЕЛИКОМ и самодостаточно. data/equipment/weapons.json и легаси-i18n —
 * пустые движковые базы. Варианты (trueItemId) разворачиваются внутри
 * самого модуля — чтения data/ в каталоге и реестре нет.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale, getModuleWeapons } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleWeapons from '../../modules/fallout/data/equipment/weapons.json';
import moduleRuWeapons from '../../modules/fallout/i18n/ru-RU/data/equipment/weapons/weapons.json';
import moduleEnWeapons from '../../modules/fallout/i18n/en-EN/data/equipment/weapons/weapons.json';
import dataWeapons from '../../data/equipment/weapons.json';
import legacyRuWeapons from '../../i18n/ru-RU/data/equipment/weapons/weapons.json';
import legacyEnWeapons from '../../i18n/en-EN/data/equipment/weapons/weapons.json';

describe('Оружие в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('модуль самодостаточен: 118 базовых + 2 варианта, trueItemId на месте', () => {
    expect(moduleWeapons).toHaveLength(120);
    const ids = new Set(moduleWeapons.map((w) => w.id));
    expect(ids.size).toBe(120);
    expect(ids.has('weapon_switchblade')).toBe(true); // истинный предмет варианта
    const razor = moduleWeapons.find((w) => w.id === 'weapon_straight_razor');
    expect(razor.trueItemId).toBe('weapon_switchblade');
    expect(razor.damage).toBeUndefined(); // тонкая запись, статы от истинного
    expect(ids.has('weapon_10mm_smg')).toBe(true); // полная запись модуля
    expect(moduleWeapons.find((w) => w.id === 'weapon_10mm_smg').damage).toBeDefined();
  });

  it('i18n модуля покрывает все 120 id в обеих локалях', () => {
    const ids = new Set(moduleWeapons.map((w) => w.id));
    expect(moduleRuWeapons).toHaveLength(120);
    expect(moduleEnWeapons).toHaveLength(120);
    for (const i18n of [moduleRuWeapons, moduleEnWeapons]) {
      const i18nIds = new Set(i18n.map((w) => w.id));
      expect(i18nIds).toEqual(ids);
      for (const w of i18n) expect(w.name.length).toBeGreaterThan(0);
    }
  });

  it('data/ и легаси-i18n пусты (движок без сеттинга)', () => {
    expect(dataWeapons).toEqual([]);
    expect(legacyRuWeapons).toEqual([]);
    expect(legacyEnWeapons).toEqual([]);
  });

  it('каталог: 120 оружий из модуля, вариант разворачивается внутри модуля', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.weapons).toHaveLength(120);
    const razor = catalog.weapons.find((w) => w.id === 'weapon_straight_razor');
    expect(razor.name).toBe('Опасная бритва');
    expect(razor.damage).toBe(2); // механика ножа из модуля
    expect(catalog.weapons.find((w) => w.id === 'weapon_switchblade')).toBeDefined();
    const smg = catalog.weapons.find((w) => w.id === 'weapon_10mm_smg');
    expect(smg.name.length).toBeGreaterThan(0);
  });

  it('getModuleWeapons разворачивает варианты без базы data/', () => {
    const weapons = getModuleWeapons();
    expect(weapons).toHaveLength(120);
    expect(weapons.find((w) => w.id === 'weapon_straight_razor').damage).toBe(2);
  });
});
