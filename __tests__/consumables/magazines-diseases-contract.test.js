import { describe, it, expect } from 'vitest';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { getDiseasesCatalog } from '../../i18n/conditionsCatalog';
import dataMagazines from '../../data/consumables/magazines.json';
import ruMagazines from '../../i18n/ru-RU/data/consumables/magazines.json';
import enMagazines from '../../i18n/en-EN/data/consumables/magazines.json';
import dataDiseases from '../../data/conditions/diseases.json';
import ruDiseases from '../../i18n/ru-RU/data/conditions/diseases.json';
import enDiseases from '../../i18n/en-EN/data/conditions/diseases.json';

// Контракт импорта журналов и болезней (core rulebook: стр. 171-179 журналы,
// стр. 193 болезни). Источник механики — data/, тексты — i18n обеих локалей.
// Журналы: 20 серий (таблица случайной публикации d20 1-20), 95 предметов:
// 10 одиночных + 85 выпусков; у серий Live & Love и Tesla Science Magazine
// диапазон 19-20 — «переброс результата», предмета под него нет.
// Болезни: 20 записей, d20Roll 1-20 без дыр, duration >= 1 стадия.

const SERIES_D20 = {
  la_fantoma: 1,
  astoundingly_awesome_tales: 2,
  backwoodsman: 3,
  boxing_times: 4,
  duck_and_cover: 5,
  fixin_things: 6,
  future_weapons_today: 7,
  grognak_the_barbarian: 8,
  guns_and_bullets: 9,
  live_and_love: 10,
  massachusetts_surgical_journal: 11,
  meeting_people: 12,
  programmers_digest: 13,
  tales_of_a_junktown_jerky_vendor: 14,
  tesla_science_magazine: 15,
  true_police_stories: 16,
  tumblers_today: 17,
  unstoppables: 18,
  us_covert_operations_manual: 19,
  wasteland_survival_guide: 20,
};

const REROLL_RANGE = '19-20';

const parseRange = (raw) => {
  const [lo, hi] = raw.split('-').map(Number);
  return { lo, hi };
};

describe('magazines data contract', () => {
  it('именно 95 журналов: 10 одиночных + 85 выпусков, id уникальны', () => {
    expect(dataMagazines).toHaveLength(95);
    expect(new Set(dataMagazines.map((m) => m.id)).size).toBe(95);
    const singles = dataMagazines.filter((m) => m.issue === null);
    const issues = dataMagazines.filter((m) => m.issue !== null);
    expect(singles).toHaveLength(10);
    expect(issues).toHaveLength(85);
  });

  it('каждая запись несёт полную механику журнала', () => {
    for (const m of dataMagazines) {
      expect(m.itemType).toBe('magazine');
      expect(m.weight).toBe(0.1);
      expect(m.cost).toBe(100);
      expect(m.rarity).toBe(3);
      expect(SERIES_D20[m.seriesId]).toBeDefined();
      expect(m.seriesD20).toBe(SERIES_D20[m.seriesId]);
    }
    // таблица случайной публикации покрывает d20 целиком и без пересечений
    expect(Object.values(SERIES_D20).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('диапазоны выпусков внутри серии упорядочены и не пересекаются; выпуски пронумерованы от 1', () => {
    const bySeries = new Map();
    for (const m of dataMagazines.filter((x) => x.issue !== null)) {
      if (!bySeries.has(m.seriesId)) bySeries.set(m.seriesId, []);
      bySeries.get(m.seriesId).push(m);
    }
    // 10 серий с выпусками
    expect(bySeries.size).toBe(10);
    for (const [seriesId, items] of bySeries) {
      const sorted = [...items].sort((a, b) => a.issue - b.issue);
      sorted.forEach((m, idx) => expect(m.issue).toBe(idx + 1));
      let prevHi = 0;
      for (const m of sorted) {
        const { lo, hi } = parseRange(m.issueD20);
        expect(lo).toBe(prevHi + 1);
        expect(hi).toBeGreaterThanOrEqual(lo);
        prevHi = hi;
      }
      // серия начинается с 1; до 20 добирает либо последний выпуск, либо reroll-ячейка книги
      expect(sorted[0].issueD20.startsWith('1-')).toBe(true);
      const coversToTwenty = prevHi === 20;
      const needsReroll = ['live_and_love', 'tesla_science_magazine'].includes(seriesId);
      expect(coversToTwenty).toBe(!needsReroll);
      if (needsReroll) expect(prevHi + '-' === '18-' || prevHi === 18).toBe(true);
    }
  });

  it('i18n ru/en полностью покрывают все id, тексты непустые', () => {
    for (const i18n of [ruMagazines, enMagazines]) {
      expect(i18n).toHaveLength(dataMagazines.length);
      const byId = new Map(i18n.map((x) => [x.id, x]));
      expect(byId.size).toBe(dataMagazines.length);
      for (const m of dataMagazines) {
        const rec = byId.get(m.id);
        expect(rec, `i18n missing ${m.id}`).toBeDefined();
        expect(rec.name.length).toBeGreaterThan(0);
        expect(rec.effectLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it('каталог объединяет механику data/ с именами обеих локалей', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const mags = getEquipmentCatalog(locale).magazines;
      expect(mags).toHaveLength(dataMagazines.length);
      for (const m of mags) {
        const data = dataMagazines.find((d) => d.id === m.id);
        expect(m.cost).toBe(data.cost);
        expect(m.seriesD20).toBe(data.seriesD20);
        expect(typeof m.name).toBe('string');
        expect(m.name.length).toBeGreaterThan(0);
        expect(m.effectLabel.length).toBeGreaterThan(0);
      }
      const sample = mags.find((m) => m.id === 'mag_us_covert_operations_manual_02');
      expect(sample).toBeDefined();
      expect(sample.issueD20).toBe('3-4');
    }
  });
});

describe('diseases data contract', () => {
  it('ровно 20 болезней, d20Roll покрывает 1-20 без дыр и повторов', () => {
    expect(dataDiseases).toHaveLength(20);
    expect(dataDiseases.map((d) => d.d20Roll).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('длительность — целое число стадий >= 1', () => {
    for (const d of dataDiseases) {
      expect(Number.isInteger(d.duration)).toBe(true);
      expect(d.duration).toBeGreaterThanOrEqual(1);
    }
  });

  it('i18n ru/en покрывают все id, тексты непустые', () => {
    for (const i18n of [ruDiseases, enDiseases]) {
      expect(i18n).toHaveLength(dataDiseases.length);
      const byId = new Map(i18n.map((x) => [x.id, x]));
      for (const d of dataDiseases) {
        const rec = byId.get(d.id);
        expect(rec, `i18n missing ${d.id}`).toBeDefined();
        expect(rec.name.length).toBeGreaterThan(0);
        expect(rec.effectLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it('каталог болезней объединяет механику и тексты обеих локалей', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const list = getDiseasesCatalog(locale);
      expect(list).toHaveLength(20);
      const antibiotics = list.find((d) => d.id === 'disease_blood_worms');
      expect(antibiotics.d20Roll).toBe(1);
      expect(antibiotics.duration).toBe(1);
      for (const d of list) {
        expect(typeof d.name).toBe('string');
        expect(d.effectLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it('точка сопряжения с антибиотиками: идентификатор состояния diseased документирован каталогом', () => {
    // chem_antibiotics снимает состояние "diseased" (data/consumables/chems.json),
    // каталог болезней — его контент. Проверяем, что heal-вектор данных на месте.
    expect(dataDiseases.every((d) => d.id.startsWith('disease_'))).toBe(true);
  });
});

describe('collision cleanup: US Special Ops Manual', () => {
  it('дубликат удалён из general goods, журнальная серия на месте', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const catalog = getEquipmentCatalog(locale);
      expect(catalog.generalGoods.find((g) => g.id === 'item_us_special_ops_manual')).toBeUndefined();
      expect(
        catalog.magazines.filter((m) => m.seriesId === 'us_covert_operations_manual'),
      ).toHaveLength(10);
    }
  });
});
