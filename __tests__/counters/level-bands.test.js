import { describe, it, expect } from 'vitest';
import { findLevelBand, resolveLevelValue } from '../../domain/levelBands';

// Полосы из обсуждения: 1-й уровень фикс, 2..20 — по 100 за уровень,
// дальше фикс + за уровень.
const CAPS_BANDS = [
  { upToLevel: 1, base: 100, perLevel: 0 },
  { upToLevel: 20, base: 0, perLevel: 100 },
  { base: 500, perLevel: 50 },
];

describe('findLevelBand', () => {
  it('берёт первую подходящую полосу сверху вниз', () => {
    expect(findLevelBand(CAPS_BANDS, 1)).toBe(CAPS_BANDS[0]);
    expect(findLevelBand(CAPS_BANDS, 2)).toBe(CAPS_BANDS[1]);
    expect(findLevelBand(CAPS_BANDS, 20)).toBe(CAPS_BANDS[1]);
    expect(findLevelBand(CAPS_BANDS, 21)).toBe(CAPS_BANDS[2]);
  });

  it('порог upToLevel включительный', () => {
    expect(findLevelBand(CAPS_BANDS, 20)).toBe(CAPS_BANDS[1]);
  });

  it('без полосы «и дальше так» выше порогов ничего не находит', () => {
    const capped = [{ upToLevel: 5, base: 10, perLevel: 0 }];
    expect(findLevelBand(capped, 6)).toBeNull();
  });

  it('не падает на мусоре в данных', () => {
    expect(findLevelBand(null, 3)).toBeNull();
    expect(findLevelBand(undefined, 3)).toBeNull();
    expect(findLevelBand([null, undefined, { base: 5 }], 3)).toEqual({ base: 5 });
    expect(findLevelBand(CAPS_BANDS, null)).toBeNull();
  });
});

describe('resolveLevelValue', () => {
  it('считает base + perLevel * level по выбранной полосе', () => {
    expect(resolveLevelValue(CAPS_BANDS, 1)).toBe(100);
    expect(resolveLevelValue(CAPS_BANDS, 2)).toBe(200);
    expect(resolveLevelValue(CAPS_BANDS, 20)).toBe(2000);
    expect(resolveLevelValue(CAPS_BANDS, 21)).toBe(500 + 50 * 21);
  });

  it('поддерживает произвольное число порогов', () => {
    // «до 5 так, после 10 вот так, после 20 вот сяк»
    const bands = [
      { upToLevel: 5, base: 50, perLevel: 0 },
      { upToLevel: 10, base: 0, perLevel: 20 },
      { upToLevel: 20, base: 100, perLevel: 10 },
      { base: 1000, perLevel: 0 },
    ];
    expect(resolveLevelValue(bands, 3)).toBe(50);
    expect(resolveLevelValue(bands, 7)).toBe(140);
    expect(resolveLevelValue(bands, 15)).toBe(250);
    expect(resolveLevelValue(bands, 99)).toBe(1000);
  });

  it('принимает голое число как константу', () => {
    expect(resolveLevelValue(250, 7)).toBe(250);
    expect(resolveLevelValue(250, 1)).toBe(250);
  });

  it('принимает одиночную полосу без списка', () => {
    expect(resolveLevelValue({ base: 10, perLevel: 5 }, 4)).toBe(30);
  });

  it('отсутствующие слагаемые считает нулём, а не поломкой', () => {
    expect(resolveLevelValue({ perLevel: 10 }, 3)).toBe(30);
    expect(resolveLevelValue({ base: 40 }, 3)).toBe(40);
    expect(resolveLevelValue({}, 3)).toBe(0);
  });

  it('ни одна полоса не подошла → 0', () => {
    expect(resolveLevelValue([{ upToLevel: 5, base: 10 }], 6)).toBe(0);
  });

  it('не выдаёт отрицательных значений', () => {
    expect(resolveLevelValue({ base: -100, perLevel: 0 }, 1)).toBe(0);
    expect(resolveLevelValue({ base: 10, perLevel: -100 }, 5)).toBe(0);
  });

  it('округляет вниз: дробных крышек не бывает', () => {
    expect(resolveLevelValue({ base: 0, perLevel: 33.3 }, 3)).toBe(99);
  });

  it('не падает на пустых и битых данных', () => {
    expect(resolveLevelValue(null, 5)).toBe(0);
    expect(resolveLevelValue(undefined, 5)).toBe(0);
    expect(resolveLevelValue([], 5)).toBe(0);
    expect(resolveLevelValue('не число', 5)).toBe(0);
  });

  it('не мутирует переданные данные', () => {
    const snapshot = JSON.parse(JSON.stringify(CAPS_BANDS));
    resolveLevelValue(CAPS_BANDS, 21);
    expect(CAPS_BANDS).toEqual(snapshot);
  });
});
