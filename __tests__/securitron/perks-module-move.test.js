/**
 * Разделение движок/сеттинг (патч 115): перки перенесены в модуль
 * ЦЕЛИКОМ. data/perks/perks.json и легаси i18n — пустые движковые базы.
 */
import { describe, it, expect } from 'vitest';
import modulePerks from '../../modules/fallout/data/perks/perks.json';
import moduleRuPerks from '../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import moduleEnPerks from '../../modules/fallout/i18n/en-EN/data/perks/perks.json';
import dataPerks from '../../data/perks/perks.json';
import legacyRuPerks from '../../i18n/ru-RU/data/perks/perks.json';
import legacyEnPerks from '../../i18n/en-EN/data/perks/perks.json';

describe('Перки в модуле (сеттинг), data/ — пустой движок', () => {
  it('модуль содержит 94 перка с механикой и переводы обеих локалей', () => {
    expect(modulePerks).toHaveLength(94);
    expect(modulePerks[0]).toHaveProperty('prerequisites');
    expect(modulePerks[0]).toHaveProperty('maxRanks');
    for (const i18n of [moduleRuPerks, moduleEnPerks]) {
      expect(i18n).toHaveLength(94);
      expect(i18n.every((p) => p.name?.length > 0 && p.effect?.length > 0)).toBe(true);
    }
    const ids = new Set(modulePerks.map((p) => p.id));
    expect(new Set(moduleRuPerks.map((p) => p.id))).toEqual(ids);
    expect(new Set(moduleEnPerks.map((p) => p.id))).toEqual(ids);
  });

  it('data/ и легаси i18n пусты', () => {
    expect(dataPerks).toEqual([]);
    expect(legacyRuPerks).toEqual([]);
    expect(legacyEnPerks).toEqual([]);
  });
});
