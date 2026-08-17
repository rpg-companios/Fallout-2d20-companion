/**
 * Разделение движок/сеттинг (патч 99): химка перенесена в модуль ЦЕЛИКОМ
 * (полные записи + i18n-имена обеих локалей) с КАНОНИЗАЦИЕЙ itemType
 * ('chems' → 'chem'). data/ и легаси-i18n для химки — пустые движковые
 * базы. Каталог отдаёт расходники без нормализующего валидатора.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import moduleChems from '../../modules/fallout/data/consumables/chems.json';
import moduleRuChems from '../../modules/fallout/i18n/ru-RU/data/consumables/chems.json';
import moduleEnChems from '../../modules/fallout/i18n/en-EN/data/consumables/chems.json';
import dataChems from '../../data/consumables/chems.json';
import legacyRuChems from '../../i18n/ru-RU/data/consumables/chems.json';
import legacyEnChems from '../../i18n/en-EN/data/consumables/chems.json';

describe('Химка в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('модуль содержит полные записи в каноническом виде (itemType: chem)', () => {
    expect(moduleChems.length).toBe(33);
    expect(moduleChems[0]).toHaveProperty('positiveEffect');
    for (const chem of moduleChems) {
      expect(chem.itemType).toBe('chem');
    }
    expect(moduleRuChems).toHaveLength(33);
    expect(moduleEnChems).toHaveLength(33);
  });

  it('data/ и легаси-i18n для химки пусты (движок без сеттинга)', () => {
    expect(dataChems).toEqual([]);
    expect(legacyRuChems).toEqual([]);
    expect(legacyEnChems).toEqual([]);
  });

  it('каталог отдаёт химку из модуля с именами, без нормализации', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    expect(catalog.chems.length).toBe(33);
    expect(catalog.chems.find((c) => c.id === 'chem_stimpak').name).toBe('Стимулятор');
    expect(catalog.chems.every((c) => c.itemType === 'chem')).toBe(true);
  });
});
