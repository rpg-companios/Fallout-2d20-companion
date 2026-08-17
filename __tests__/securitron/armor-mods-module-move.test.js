/**
 * Разделение движок/сеттинг (патч 105): моды брони перенесены в модуль
 * с КАНОНИЗАЦИЕЙ i18n (вариант владельца A): i18n мода = {id, name,
 * specialEffects: [{id, description}]} — только строки; механика
 * (value, modType, complexity, ...) — только в data. Описания эффектов
 * RU сохранены из прежнего i18n, EN — взяты из словаря armor_effects
 * (раньше у EN их не было вовсе).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleArmorMods from '../../modules/fallout/data/equipment/armor_mods.json';
import moduleUniqArmorMods from '../../modules/fallout/data/equipment/uniq_armor_mods.json';
import moduleArmorEffects from '../../modules/fallout/data/equipment/armor_effects.json';
import moduleRuArmorMods from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/armor_mods.json';
import moduleEnArmorMods from '../../modules/fallout/i18n/en-EN/data/equipment/armor/armor_mods.json';
import moduleRuUniqArmorMods from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/uniq_armor_mods.json';
import moduleEnUniqArmorMods from '../../modules/fallout/i18n/en-EN/data/equipment/armor/uniq_armor_mods.json';
import moduleRuArmorEffects from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/armor_effects.json';
import moduleEnArmorEffects from '../../modules/fallout/i18n/en-EN/data/equipment/armor/armor_effects.json';
import dataArmorMods from '../../data/equipment/armor_mods.json';
import dataUniqArmorMods from '../../data/equipment/uniq_armor_mods.json';
import dataArmorEffects from '../../data/equipment/armor_effects.json';

describe('Моды брони в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('механика модов — в модульных данных, i18n — только строки', () => {
    expect(moduleArmorMods).toHaveLength(15);
    expect(moduleUniqArmorMods).toHaveLength(22);
    expect(moduleArmorEffects).toBeDefined();
    for (const m of [...moduleArmorMods, ...moduleUniqArmorMods]) {
      expect(m).toHaveProperty('statModifiers');
      expect(m).toHaveProperty('costModifier');
      expect(m).toHaveProperty('modCategory');
      for (const se of m.specialEffects || []) {
        expect(se).toHaveProperty('value'); // механика в data
      }
    }
    for (const i18n of [moduleRuArmorMods, moduleEnArmorMods, moduleRuUniqArmorMods, moduleEnUniqArmorMods]) {
      for (const rec of i18n) {
        const keys = Object.keys(rec).sort();
        const allowed = rec.specialEffects
          ? ['id', 'name', 'specialEffects'].sort()
          : ['id', 'name'].sort();
        expect(keys, rec.id).toEqual(allowed);
        for (const se of rec.specialEffects || []) {
          expect(Object.keys(se).sort()).toEqual(['description', 'id']);
          expect(se.description.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('каждая запись данных с эффектами имеет описания в i18n обеих локалей', () => {
    for (const [data, ru, en] of [
      [moduleArmorMods, moduleRuArmorMods, moduleEnArmorMods],
      [moduleUniqArmorMods, moduleRuUniqArmorMods, moduleEnUniqArmorMods],
    ]) {
      const ruById = new Map(ru.map((r) => [r.id, r]));
      const enById = new Map(en.map((r) => [r.id, r]));
      for (const m of data) {
        const dataIds = new Set((m.specialEffects || []).map((se) => se.id));
        const ruIds = new Set((ruById.get(m.id)?.specialEffects || []).map((se) => se.id));
        const enIds = new Set((enById.get(m.id)?.specialEffects || []).map((se) => se.id));
        expect(ruIds, `ru ${m.id}`).toEqual(dataIds);
        expect(enIds, `en ${m.id}`).toEqual(dataIds);
      }
    }
  });

  it('data/ и легаси i18n пусты (движок без сеттинга)', () => {
    expect(dataArmorMods).toEqual([]);
    expect(dataUniqArmorMods).toEqual([]);
    expect(dataArmorEffects).toEqual({});
  });

  it('каталог собирает моды из модуля: механика + имена + описания', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.armorMods).toHaveLength(15);
    expect(catalog.uniqArmorMods).toHaveLength(22);
    const std = catalog.armorMods.find((m) => m.id === 'mod_std_dense');
    expect(std.name.length).toBeGreaterThan(0);
    const se = std.specialEffects.find((x) => x.id === 'effect_explosive_resistance_4');
    expect(se.value).toBe(4); // механика из data
    expect(se.description.length).toBeGreaterThan(0); // текст из i18n
    expect(catalog.armorEffects['effect_explosive_resistance_4'].description.length).toBeGreaterThan(0);
    // EN-модалка тоже получает описания (раньше их не было)
    const enCatalog = getEquipmentCatalogForLocale('en-EN');
    const enSe = enCatalog.armorMods.find((m) => m.id === 'mod_std_dense').specialEffects[0];
    expect(enSe.description.length).toBeGreaterThan(0);
  });
});
