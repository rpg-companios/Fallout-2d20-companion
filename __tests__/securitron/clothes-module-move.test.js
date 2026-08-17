/**
 * Разделение движок/сеттинг (патч 112): одежда перенесена в модуль
 * ЦЕЛИКОМ (база 3 группы + модульная группа headwear объединены).
 * data/equipment/clothes.json — пустая движковая база ({clothes: []}),
 * легаси i18n — тоже. Группы: suit (9), outfit (11), headwear (11,
 * включая маску Белой перчатки из модуля).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleClothes from '../../modules/fallout/data/equipment/clothes.json';
import moduleRuClothes from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/clothes.json';
import moduleEnClothes from '../../modules/fallout/i18n/en-EN/data/equipment/armor/clothes.json';
import dataClothes from '../../data/equipment/clothes.json';
import legacyRuClothes from '../../i18n/ru-RU/data/equipment/armor/clothes.json';
import legacyEnClothes from '../../i18n/en-EN/data/equipment/armor/clothes.json';

const countItems = (groups) => groups.reduce((sum, g) => sum + (g.items || []).length, 0);

describe('Одежда в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('модуль содержит все группы: suit, outfit, headwear (31 предмет)', () => {
    const groups = moduleClothes.clothes;
    expect(groups.map((g) => g.clothingType).sort()).toEqual(['headwear', 'outfit', 'suit']);
    expect(countItems(groups)).toBe(31);
    expect(groups.find((g) => g.clothingType === 'suit').items).toHaveLength(9);
    expect(groups.find((g) => g.clothingType === 'outfit').items).toHaveLength(11);
    const headwear = groups.find((g) => g.clothingType === 'headwear');
    expect(headwear.items).toHaveLength(11);
    // модульная запись (маска Белой перчатки) на месте
    expect(headwear.items.some((i) => i.id === 'headwear_white_glove_mask')).toBe(true);
  });

  it('переводы покрывают все предметы в обеих локалях', () => {
    for (const i18n of [moduleRuClothes, moduleEnClothes]) {
      expect(countItems(i18n.clothes)).toBe(31);
      for (const g of i18n.clothes) {
        for (const item of g.items) expect(item.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('data/ и легаси i18n пусты', () => {
    expect(dataClothes).toEqual({ clothes: [] });
    expect(legacyRuClothes).toEqual({ clothes: [] });
    expect(legacyEnClothes).toEqual({ clothes: [] });
  });

  it('каталог отдаёт одежду из модуля (имена + механика)', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const items = catalog.clothes.clothes.flatMap((g) => g.items || []);
    expect(items).toHaveLength(31);
    const mask = items.find((i) => i.id === 'headwear_white_glove_mask');
    expect(mask.name.length).toBeGreaterThan(0);
    expect(mask.protectedAreas).toBeDefined();
  });
});
