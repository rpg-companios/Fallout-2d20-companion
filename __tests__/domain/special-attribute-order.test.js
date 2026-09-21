// Предохранитель порядка атрибутов SPECIAL.
//
// Слово владельца (2026-09-21): «атрибуты должны идти так и никак иначе —
// Сила, Восприятие, Выносливость, Харизма, Интеллект, Ловкость, Удача».
//
// До патча 289 порядок в коде был историческим STR, END, PER, AGI, INT, CHA,
// LCK — с самых первых коммитов проекта (проверено git log -S: канона в
// истории не существовало). Патч 289 выровнял все точки, где порядок задаётся,
// и добавил этот тест: любая новая точка обязана совпадать с каноном.
// Источник истины — CANONICAL_ATTRIBUTE_KEYS в domain/characterCreation.js.

import { describe, it, expect } from 'vitest';
import { CANONICAL_ATTRIBUTE_KEYS, createInitialAttributes } from '../../domain/characterCreation';
import { PERK_ATTRIBUTE_FILTER_CODES } from '../../domain/perks';
import { selectLegacyAttributes } from '../../src/store/selectors';

const SPECIAL_CANON = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'];

describe('порядок атрибутов SPECIAL — канон правил (слово владельца 2026-09-21)', () => {
  it('CANONICAL_ATTRIBUTE_KEYS — единственный источник порядка', () => {
    expect(CANONICAL_ATTRIBUTE_KEYS).toEqual(SPECIAL_CANON);
  });

  it('createInitialAttributes — строки создания персонажа в каноне', () => {
    expect(createInitialAttributes().map((a) => a.name)).toEqual(SPECIAL_CANON);
  });

  it('PERK_ATTRIBUTE_FILTER_CODES — фильтры перков в каноне', () => {
    expect(PERK_ATTRIBUTE_FILTER_CODES).toEqual(SPECIAL_CANON);
  });

  it('selectLegacyAttributes выравнивает исторический порядок старых сейвов', () => {
    // Сейв, записанный до патча 289: ключи в историческом порядке.
    const attributes = {};
    for (const id of ['STR', 'END', 'PER', 'AGI', 'INT', 'CHA', 'LCK']) {
      attributes[id] = { id, base: 5 };
    }
    expect(selectLegacyAttributes({ attributes }).map((a) => a.name)).toEqual(SPECIAL_CANON);
  });

  it('selectLegacyAttributes: неизвестный атрибут не ломает порядок остальных', () => {
    const attributes = {
      LCK: { id: 'LCK', base: 5 },
      STR: { id: 'STR', base: 5 },
      AGI: { id: 'AGI', base: 5 },
    };
    expect(selectLegacyAttributes({ attributes }).map((a) => a.name)).toEqual(['STR', 'AGI', 'LCK']);
  });

  it('селектор и createInitialAttributes согласованы (старый инвариант тестов)', () => {
    const attributes = {};
    for (const { name, value } of createInitialAttributes()) {
      attributes[name] = { id: name, base: value };
    }
    expect(selectLegacyAttributes({ attributes })).toEqual(createInitialAttributes());
  });
});
