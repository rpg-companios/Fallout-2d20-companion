/**
 * Разделение движок/сеттинг (патч 104): броня перенесена в модуль
 * ЦЕЛИКОМ. data/equipment/armor.json — пустая движковая база ({} —
 * словарь категорий), легаси i18n — {armor: []}. Форматы сохранены:
 * механика — категории/tiers/pieces, переводы — группы {armor:[...]}.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale } from '../../i18n/locale';
import moduleArmor from '../../modules/fallout/data/equipment/armor.json';
import moduleRuArmor from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/armor.json';
import moduleEnArmor from '../../modules/fallout/i18n/en-EN/data/equipment/armor/armor.json';
import dataArmor from '../../data/equipment/armor.json';
import legacyRuArmor from '../../i18n/ru-RU/data/equipment/armor/armor.json';
import legacyEnArmor from '../../i18n/en-EN/data/equipment/armor/armor.json';

const countPieces = (armor) =>
  Object.values(armor || {}).reduce(
    (sum, cat) => sum + Object.values(cat?.tiers || {}).reduce(
      (s, tier) => s + (tier?.pieces || []).length, 0), 0);

describe('Броня в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => setCurrentLocale('ru-RU'));

  it('модуль содержит полную механику брони (56 деталей в 6 категориях)', () => {
    expect(countPieces(moduleArmor)).toBe(56);
    expect(Object.keys(moduleArmor)).toContain('combatArmor');
    const piece = moduleArmor.raiderArmor.tiers.standard.pieces[0];
    expect(piece).toHaveProperty('physicalDamageRating');
    expect(piece).toHaveProperty('protectedAreas');
  });

  it('переводы — группы {armor:[...]}, items только {id, name}, 56 имён в каждой локали', () => {
    for (const i18n of [moduleRuArmor, moduleEnArmor]) {
      expect(i18n.armor).toHaveLength(6);
      const items = i18n.armor.flatMap((g) => g.items || []);
      expect(items).toHaveLength(56);
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['id', 'name']);
        expect(item.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('data/ и легаси i18n пусты (движок без сеттинга)', () => {
    expect(dataArmor).toEqual({});
    expect(legacyRuArmor).toEqual({ armor: [] });
    expect(legacyEnArmor).toEqual({ armor: [] });
  });

  it('каталог собирает броню из модуля (armorList, armorRaw, имена)', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.armorList).toHaveLength(56);
    expect(catalog.armorRaw).toBe(moduleArmor);
    expect(catalog.armor.armor).toHaveLength(6);
    const item = catalog.armorList.find((a) => a.id === 'combat_armor_chest_standard') || catalog.armorList[0];
    expect(item.name.length).toBeGreaterThan(0);
    expect(item.physicalDamageRating).toBeDefined();
  });
});
