/**
 * Разделение движок/сеттинг (патч 113): общие товары перенесены в модуль
 * ЦЕЛИКОМ (база 31 + модуль 4 объединены по id). data/ и легаси i18n —
 * пустые движковые базы.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleGeneralGoods from '../../modules/fallout/data/equipment/general_goods.json';
import moduleRuGeneralGoods from '../../modules/fallout/i18n/ru-RU/data/equipment/general_goods.json';
import moduleEnGeneralGoods from '../../modules/fallout/i18n/en-EN/data/equipment/general_goods.json';
import dataGeneralGoods from '../../data/equipment/general_goods.json';
import legacyRuGeneralGoods from '../../i18n/ru-RU/data/equipment/general_goods.json';
import legacyEnGeneralGoods from '../../i18n/en-EN/data/equipment/general_goods.json';

describe('Общие товары в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('модуль содержит все записи (35: 31 база + 4 модуля) и переводы', () => {
    expect(moduleGeneralGoods).toHaveLength(35);
    expect(moduleGeneralGoods[0]).toHaveProperty('value');
    for (const i18n of [moduleRuGeneralGoods, moduleEnGeneralGoods]) {
      expect(i18n).toHaveLength(35);
      expect(i18n.every((x) => x.name?.length > 0)).toBe(true);
    }
  });

  it('data/ и легаси i18n пусты', () => {
    expect(dataGeneralGoods).toEqual([]);
    expect(legacyRuGeneralGoods).toEqual([]);
    expect(legacyEnGeneralGoods).toEqual([]);
  });

  it('каталог отдаёт общие товары из модуля', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.generalGoods).toHaveLength(35);
    expect(catalog.generalGoods[0].name.length).toBeGreaterThan(0);
  });
});
