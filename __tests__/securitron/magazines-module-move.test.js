/**
 * Разделение движок/сеттинг (патч 100): журналы перенесены в модуль
 * ЦЕЛИКОМ (полные записи + i18n-имена обеих локалей). data/ и легаси-i18n
 * для журналов — пустые движковые базы. Каталог отдаёт журналы без
 * нормализующего валидатора (validateConsumablesContract удалён).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { setCurrentLocale } from '../../i18n/locale';
import moduleMagazines from '../../modules/fallout/data/consumables/magazines.json';
import moduleRuMagazines from '../../modules/fallout/i18n/ru-RU/data/consumables/magazines.json';
import moduleEnMagazines from '../../modules/fallout/i18n/en-EN/data/consumables/magazines.json';
import dataMagazines from '../../data/consumables/magazines.json';
import legacyRuMagazines from '../../i18n/ru-RU/data/consumables/magazines.json';
import legacyEnMagazines from '../../i18n/en-EN/data/consumables/magazines.json';

describe('Журналы в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => setCurrentLocale('ru-RU'));

  it('модуль содержит полные записи журналов (95) и переводы обеих локалей', () => {
    expect(moduleMagazines).toHaveLength(95);
    expect(moduleMagazines[0]).toHaveProperty('seriesId');
    expect(moduleMagazines[0]).toHaveProperty('seriesD20');
    for (const m of moduleMagazines) {
      expect(m.itemType).toBe('magazine');
    }
    expect(moduleRuMagazines).toHaveLength(95);
    expect(moduleEnMagazines).toHaveLength(95);
  });

  it('data/ и легаси-i18n для журналов пусты (движок без сеттинга)', () => {
    expect(dataMagazines).toEqual([]);
    expect(legacyRuMagazines).toEqual([]);
    expect(legacyEnMagazines).toEqual([]);
  });

  it('каталог отдаёт журналы из модуля с именами, без нормализации', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    expect(catalog.magazines).toHaveLength(95);
    expect(catalog.magazines.find((m) => m.id === 'mag_la_fantoma').name).toBe('Ла Фантома!');
    expect(catalog.magazines.every((m) => m.itemType === 'magazine')).toBe(true);
  });
});
