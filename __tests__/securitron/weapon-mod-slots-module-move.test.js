/**
 * Разделение движок/сеттинг (патч 103): weapon_mod_slots (какие моды
 * в какие слоты какого оружия) — контент сеттинга, перенесён в модуль
 * целиком. data/equipment/weapon_mod_slots.json — пустая движковая база
 * ({} — это словарь, не массив).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleSlots from '../../modules/fallout/data/equipment/weapon_mod_slots.json';
import dataSlots from '../../data/equipment/weapon_mod_slots.json';

describe('weapon_mod_slots в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('модуль содержит словарь слотов: { weaponId: { slot: [modIds] } }', () => {
    expect(moduleSlots).toBeDefined();
    const weaponIds = Object.keys(moduleSlots);
    expect(weaponIds.length).toBeGreaterThan(0);
    for (const weaponId of weaponIds) {
      const slots = moduleSlots[weaponId];
      expect(typeof slots).toBe('object');
      for (const [slot, modIds] of Object.entries(slots)) {
        expect(slot.length).toBeGreaterThan(0);
        expect(Array.isArray(modIds)).toBe(true);
        expect(modIds.length).toBeGreaterThan(0);
      }
    }
  });

  it('data/ для слотов пуст (движок без сеттинга)', () => {
    expect(dataSlots).toEqual({});
  });

  it('каталог отдаёт modsOverrides из модуля', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.modsOverrides).toBe(moduleSlots);
    expect(catalog.modsOverrides.weapon_chinese_assault_rifle.Receiver).toContain('mod_007');
  });
});
