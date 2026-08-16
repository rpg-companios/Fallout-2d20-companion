/**
 * Разделение движок/сеттинг (патч 118): системные словари переводов
 * (qualities 30, effects, damageEffects 10, miscellaneous 2) перенесены
 * в модуль. Легаси i18n — пустые базы. Каталог отдаёт их из модуля.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale } from '../../i18n/locale';
import moduleRuQualities from '../../modules/fallout/i18n/ru-RU/data/system/qualities.json';
import moduleEnQualities from '../../modules/fallout/i18n/en-EN/data/system/qualities.json';
import moduleRuEffects from '../../modules/fallout/i18n/ru-RU/data/system/effects.json';
import moduleRuDamageEffects from '../../modules/fallout/i18n/ru-RU/data/system/damageEffects.json';
import moduleRuItems from '../../modules/fallout/i18n/ru-RU/data/equipment/items.json';
import legacyRuQualities from '../../i18n/ru-RU/data/system/qualities.json';
import legacyEnQualities from '../../i18n/en-EN/data/system/qualities.json';

describe('Системные i18n в модуле (сеттинг), легаси — пуст', () => {
  beforeAll(() => setCurrentLocale('ru-RU'));

  it('модуль содержит качества (30), эффекты, damageEffects и miscellaneous', () => {
    expect(moduleRuQualities).toHaveLength(30);
    expect(moduleEnQualities).toHaveLength(30);
    expect(moduleRuQualities[0]).toHaveProperty('name');
    expect(moduleRuEffects).toHaveProperty('duration');
    expect(moduleRuDamageEffects).toHaveLength(10);
    expect(moduleRuItems).toHaveLength(2);
  });

  it('легаси i18n пусты', () => {
    expect(legacyRuQualities).toEqual([]);
    expect(legacyEnQualities).toEqual([]);
  });

  it('каталог отдаёт qualities/effects/miscellaneous из модуля', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.qualities).toHaveLength(30);
    expect(catalog.qualities[0].name.length).toBeGreaterThan(0);
    expect(catalog.effects).toBeDefined();
    expect(catalog.damageEffects).toHaveLength(10);
    expect(catalog.miscellaneous).toHaveLength(2);
  });
});
