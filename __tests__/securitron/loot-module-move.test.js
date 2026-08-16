/**
 * Разделение движок/сеттинг (патч 101): таблицы лута и стабы перенесены
 * в модуль ЦЕЛИКОМ (7 файлов, структура сохранена; имена стабов — в i18n
 * модуля обеих локалей). data/loot и легаси-i18n — пустые движковые базы.
 */
import { describe, it, expect } from 'vitest';
import moduleTrinkets from '../../modules/fallout/data/loot/trinkets.json';
import moduleFood from '../../modules/fallout/data/loot/food.json';
import moduleBrewery from '../../modules/fallout/data/loot/brewery.json';
import moduleChems from '../../modules/fallout/data/loot/chems.json';
import moduleOutcast from '../../modules/fallout/data/loot/outcast.json';
import moduleWeaponsMelee from '../../modules/fallout/data/loot/weapons_melee.json';
import moduleLootStubs from '../../modules/fallout/data/loot/_stubs.json';
import moduleRuStubs from '../../modules/fallout/i18n/ru-RU/data/loot/stubs.json';
import moduleEnStubs from '../../modules/fallout/i18n/en-EN/data/loot/stubs.json';
import dataTrinkets from '../../data/loot/trinkets.json';
import dataFood from '../../data/loot/food.json';
import dataBrewery from '../../data/loot/brewery.json';
import dataChems from '../../data/loot/chems.json';
import dataOutcast from '../../data/loot/outcast.json';
import dataWeaponsMelee from '../../data/loot/weapons_melee.json';
import dataLootStubs from '../../data/loot/_stubs.json';
import legacyRuStubs from '../../i18n/ru-RU/data/loot/stubs.json';
import legacyEnStubs from '../../i18n/en-EN/data/loot/stubs.json';

describe('Лут в модуле (сеттинг), data/ — пустой движок', () => {
  it('таблицы лута в модуле, по файлу на таблицу (структура сохранена)', () => {
    expect(moduleTrinkets).toHaveLength(20);
    expect(moduleFood).toHaveLength(39);
    expect(moduleBrewery).toHaveLength(39);
    expect(moduleChems).toHaveLength(39);
    expect(moduleOutcast).toHaveLength(20);
    expect(moduleWeaponsMelee).toHaveLength(39);
    for (const table of [moduleTrinkets, moduleFood, moduleBrewery, moduleChems, moduleOutcast, moduleWeaponsMelee]) {
      for (const entry of table) {
        expect(entry).toHaveProperty('roll');
        expect(entry).toHaveProperty('id');
      }
    }
  });

  it('стабы: механика в модульных данных, имена — в i18n модуля обеих локалей', () => {
    expect(moduleLootStubs).toHaveLength(37);
    expect(moduleRuStubs).toHaveLength(37);
    expect(moduleEnStubs).toHaveLength(37);
    const stubIds = new Set(moduleLootStubs.map((s) => s.id));
    expect(new Set(moduleRuStubs.map((s) => s.id))).toEqual(stubIds);
    expect(new Set(moduleEnStubs.map((s) => s.id))).toEqual(stubIds);
  });

  it('data/loot и легаси-i18n пусты (движок без сеттинга)', () => {
    expect(dataTrinkets).toEqual([]);
    expect(dataFood).toEqual([]);
    expect(dataBrewery).toEqual([]);
    expect(dataChems).toEqual([]);
    expect(dataOutcast).toEqual([]);
    expect(dataWeaponsMelee).toEqual([]);
    expect(dataLootStubs).toEqual([]);
    expect(legacyRuStubs).toEqual([]);
    expect(legacyEnStubs).toEqual([]);
  });
});
