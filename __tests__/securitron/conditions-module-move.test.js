/**
 * Разделение движок/сеттинг (патч 98): болезни перенесены в модуль ЦЕЛИКОМ
 * (полные записи + i18n-имена обеих локалей). data/ и легаси-i18n для
 * болезней — пустые движковые базы.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getDiseasesCatalog } from '../../i18n/conditionsCatalog';
import { setCurrentLocale } from '../../i18n/locale';
import moduleDiseases from '../../modules/fallout/data/conditions/diseases.json';
import moduleRuDiseases from '../../modules/fallout/i18n/ru-RU/data/conditions/diseases.json';
import moduleEnDiseases from '../../modules/fallout/i18n/en-EN/data/conditions/diseases.json';
import dataDiseases from '../../data/conditions/diseases.json';
import legacyRuDiseases from '../../i18n/ru-RU/data/conditions/diseases.json';
import legacyEnDiseases from '../../i18n/en-EN/data/conditions/diseases.json';

describe('Болезни в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => setCurrentLocale('ru-RU'));

  it('модуль содержит полные записи болезней и переводы обеих локалей', () => {
    expect(moduleDiseases.length).toBe(20);
    expect(moduleDiseases[0]).toHaveProperty('d20Roll');
    expect(moduleDiseases[0]).toHaveProperty('duration');
    expect(moduleRuDiseases).toHaveLength(20);
    expect(moduleEnDiseases).toHaveLength(20);
  });

  it('data/ и легаси-i18n для болезней пусты (движок без сеттинга)', () => {
    expect(dataDiseases).toEqual([]);
    expect(legacyRuDiseases).toEqual([]);
    expect(legacyEnDiseases).toEqual([]);
  });

  it('каталог отдаёт полные данные из модуля с именами обеих локалей', () => {
    const ru = getDiseasesCatalog('ru-RU');
    expect(ru).toHaveLength(20);
    expect(ru.find((d) => d.id === 'disease_blood_worms').name).toBe('Кровяные черви');
    const en = getDiseasesCatalog('en-EN');
    expect(en).toHaveLength(20);
    expect(en.find((d) => d.id === 'disease_blood_worms').name.length).toBeGreaterThan(0);
  });
});
