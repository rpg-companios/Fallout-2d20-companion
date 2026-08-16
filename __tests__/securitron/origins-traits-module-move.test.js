/**
 * Разделение движок/сеттинг (патч 117): базы ориджинов (17) и трейтов (32)
 * перенесены в модуль и объединены с модульными (2 ориджина, 5 трейтов).
 * data/ и легаси i18n — пустые движковые базы. Реестр читает только модуль.
 *
 * ВАЖНО: при squash-коммите были потеряны i18n-тексты модульных трейтов
 * (treeFamilies/enclaveRemnant) — восстановлены из артефакта
 * patchs/96-module-i18n-restructure.patch (см. патч 117).
 */
import { describe, it, expect } from 'vitest';
import { getOrigins, getTraits, getOriginI18n, getTraitI18n } from '../../domain/registry';
import moduleOrigins from '../../modules/fallout/data/origins/origins.json';
import moduleTraits from '../../modules/fallout/data/traits/traits.json';
import dataOrigins from '../../data/origins/origins.json';
import dataTraits from '../../data/traits/traits.json';
import legacyRuOrigins from '../../i18n/ru-RU/data/system/origins.json';
import legacyEnOrigins from '../../i18n/en-EN/data/system/origins.json';
import legacyRuTraits from '../../i18n/ru-RU/data/system/traits.json';
import legacyEnTraits from '../../i18n/en-EN/data/system/traits.json';

describe('Ориджины и трейты в модуле (сеттинг), data/ — пустой движок', () => {
  it('модуль содержит 19 ориджинов (17+2) и 37 трейтов (32+5)', () => {
    expect(moduleOrigins).toHaveLength(19);
    expect(moduleTraits).toHaveLength(37);
    expect(moduleOrigins.some((o) => o.id === 'securitron')).toBe(true);
    expect(moduleOrigins.some((o) => o.id === 'TreeFamilies')).toBe(true);
    expect(moduleOrigins.some((o) => o.id === 'enclaveRemnant')).toBe(true);
    expect(moduleTraits.some((t) => t.id === 'treefamilies-chairmen')).toBe(true);
    expect(moduleTraits.some((t) => t.id === 'enclaveRemnant-hidden')).toBe(true);
  });

  it('реестр отдаёт данные и i18n только из модуля', () => {
    expect(getOrigins()).toHaveLength(19);
    expect(getTraits()).toHaveLength(37);
    expect(getOriginI18n('ru-RU').TreeFamilies).toBe('Три семьи');
    expect(getOriginI18n('en-EN').TreeFamilies).toBe('Strip Families');
    expect(getOriginI18n('ru-RU').securitron).toBeTruthy();
    expect(getTraitI18n('ru-RU').traits.treeFamilies.chairmen.name).toBe('Председатели');
    expect(getTraitI18n('en-EN').traits.enclaveRemnant.hidden.name).toBe('Hidden and Hunted');
    expect(getTraitI18n('ru-RU').traits.brotherhood).toBeTruthy(); // база на месте
  });

  it('каждый трейт данных имеет имя и описание в i18n обеих локалей', () => {
    for (const loc of ['ru-RU', 'en-EN']) {
      const i18n = getTraitI18n(loc);
      for (const trait of moduleTraits) {
        const parts = trait.displayNameKey.split('.');
        let node = i18n;
        for (const p of parts) node = node?.[p];
        expect(typeof node, `${loc} name ${trait.id}`).toBe('string');
        expect(node.length).toBeGreaterThan(0);
        const descParts = trait.descriptionKey.split('.');
        let dnode = i18n;
        for (const p of descParts) dnode = dnode?.[p];
        expect(typeof dnode, `${loc} desc ${trait.id}`).toBe('string');
        expect(dnode.length).toBeGreaterThan(0);
      }
    }
  });

  it('data/ и легаси i18n пусты', () => {
    expect(dataOrigins).toEqual([]);
    expect(dataTraits).toEqual([]);
    expect(legacyRuOrigins).toEqual({});
    expect(legacyEnOrigins).toEqual({});
    expect(legacyRuTraits).toEqual({ traits: {} });
    expect(legacyEnTraits).toEqual({ traits: {} });
  });
});
