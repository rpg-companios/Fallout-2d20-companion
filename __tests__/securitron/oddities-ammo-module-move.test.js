/**
 * Разделение движок/сеттинг (патчи 110–111): диковины (20) и патроны (42)
 * перенесены в модуль ЦЕЛИКОМ. data/ и легаси i18n — пустые движковые базы.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale } from '../../i18n/locale';
import moduleOddities from '../../modules/fallout/data/equipment/oddities.json';
import moduleAmmo from '../../modules/fallout/data/equipment/ammo.json';
import moduleRuOddities from '../../modules/fallout/i18n/ru-RU/data/equipment/oddities.json';
import moduleEnOddities from '../../modules/fallout/i18n/en-EN/data/equipment/oddities.json';
import moduleRuAmmo from '../../modules/fallout/i18n/ru-RU/data/equipment/ammo/ammo_types.json';
import moduleEnAmmo from '../../modules/fallout/i18n/en-EN/data/equipment/ammo/ammo_types.json';
import dataOddities from '../../data/equipment/oddities.json';
import dataAmmo from '../../data/equipment/ammo.json';
import legacyRuOddities from '../../i18n/ru-RU/data/equipment/oddities.json';
import legacyEnOddities from '../../i18n/en-EN/data/equipment/oddities.json';
import legacyRuAmmo from '../../i18n/ru-RU/data/equipment/ammo/ammo_types.json';
import legacyEnAmmo from '../../i18n/en-EN/data/equipment/ammo/ammo_types.json';

describe('Диковины и патроны в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => setCurrentLocale('ru-RU'));

  it('модуль содержит полные записи и переводы обеих локалей', () => {
    expect(moduleOddities).toHaveLength(20);
    expect(moduleAmmo).toHaveLength(42);
    expect(moduleOddities[0]).toHaveProperty('value');
    expect(moduleAmmo[0]).toHaveProperty('cost');
    for (const i18n of [moduleRuOddities, moduleEnOddities]) {
      expect(i18n).toHaveLength(20);
      expect(i18n.every((x) => x.name?.length > 0)).toBe(true);
    }
    for (const i18n of [moduleRuAmmo, moduleEnAmmo]) {
      expect(i18n).toHaveLength(42);
      expect(i18n.every((x) => x.name?.length > 0)).toBe(true);
    }
  });

  it('data/ и легаси i18n пусты', () => {
    expect(dataOddities).toEqual([]);
    expect(dataAmmo).toEqual([]);
    expect(legacyRuOddities).toEqual([]);
    expect(legacyEnOddities).toEqual([]);
    expect(legacyRuAmmo).toEqual([]);
    expect(legacyEnAmmo).toEqual([]);
  });

  it('каталог отдаёт диковины и патроны из модуля', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.oddities).toHaveLength(20);
    expect(catalog.oddities[0].name.length).toBeGreaterThan(0);
    expect(catalog.ammoTypes).toHaveLength(42);
    expect(catalog.ammoTypes[0].name.length).toBeGreaterThan(0);
    expect(catalog.ammoTypes[0].itemType).toBe('ammo');
  });
});
