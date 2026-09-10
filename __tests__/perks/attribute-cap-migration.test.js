// __tests__/perks/attribute-cap-migration.test.js
//
// Патч 220: починка сейвов с завышенными базами атрибутов. Дефект патча 219
// (до починки) задваивал прибавку «Интенсивных тренировок»: ловкость 8 + два
// ранга давали 11 вместо 10. Миграция v25 -> v26 клампит базу к потолку
// черты из ДАННЫХ (modules/fallout/data/traits/traits.json).

import { describe, expect, it } from 'vitest';
import { migrateAttributeCaps } from '../../modules/fallout/perks/migration';
// Регистрация в цепочку движка — side-effect импорта модуля (как в App.js).
import '../../modules/fallout/perks/migration';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const attributes = (values) => Object.entries(values).map(([name, value]) => ({ name, value }));

describe('migrateAttributeCaps (патч 220)', () => {
  it('ловкость 11 при обычной черте клампится к 10', () => {
    const state = {
      trait: { id: 'brotherhood-chain-that-binds', name: 'Цепь, что связывает' },
      attributes: attributes({ STR: 5, AGI: 11, LCK: 4 }),
    };
    const next = migrateAttributeCaps(state);
    expect(next.attributes.find((a) => a.name === 'AGI').value).toBe(10);
    expect(next.attributes.find((a) => a.name === 'STR').value).toBe(5);
    expect(next.attributes.find((a) => a.name === 'LCK').value).toBe(4);
  });

  it('супермутант: СИЛ 11 законен (потолок 12), ХАР 7 и ИНТ 7 клампятся к 6', () => {
    const state = {
      trait: { id: 'supermutant-forced-evolution', name: 'Forced Evolution' },
      attributes: attributes({ STR: 11, END: 6, CHA: 7, INT: 7 }),
    };
    const next = migrateAttributeCaps(state);
    expect(next.attributes.find((a) => a.name === 'STR').value).toBe(11);
    expect(next.attributes.find((a) => a.name === 'CHA').value).toBe(6);
    expect(next.attributes.find((a) => a.name === 'INT').value).toBe(6);
  });

  it('тень: СИЛ 11 законен, ХАР 9 клампится к 8', () => {
    const state = {
      trait: { id: 'shadow', name: 'Shadow' },
      attributes: attributes({ STR: 11, CHA: 9 }),
    };
    const next = migrateAttributeCaps(state);
    expect(next.attributes.find((a) => a.name === 'STR').value).toBe(11);
    expect(next.attributes.find((a) => a.name === 'CHA').value).toBe(8);
  });

  it('первичный id мульти-трейта берётся из ids[0]', () => {
    const state = {
      trait: { ids: ['shadow', 'survivor'], id: 'shadow', name: 'Тень' },
      attributes: attributes({ CHA: 9 }),
    };
    expect(migrateAttributeCaps(state).attributes[0].value).toBe(8);
  });

  it('неизвестная черта — состояние не трогаем', () => {
    const state = {
      trait: { id: 'no-such-trait', name: '?' },
      attributes: attributes({ AGI: 11 }),
    };
    expect(migrateAttributeCaps(state)).toBe(state);
  });

  it('идемпотентна: повторный прогон не меняет уже клампнутое', () => {
    const state = {
      trait: { id: 'shadow', name: 'Shadow' },
      attributes: attributes({ CHA: 8, AGI: 10 }),
    };
    expect(migrateAttributeCaps(state)).toBe(state);
    const inflated = migrateAttributeCaps({
      trait: { id: 'shadow', name: 'Shadow' },
      attributes: attributes({ CHA: 12 }),
    });
    expect(migrateAttributeCaps(inflated)).toBe(inflated);
  });

  it('в цепочке движка: сейв v25 с ЛОВ 11 мигрирует в v26 с ЛОВ 10', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(26);
    const migrated = migrateCharacterState({
      schemaVersion: 25,
      trait: { id: 'shadow', name: 'Shadow' },
      attributes: attributes({ STR: 5, CHA: 9, AGI: 11 }),
      skills: [],
      selectedSkills: [],
    });
    expect(migrated.schemaVersion).toBe(26);
    expect(migrated.attributes.find((a) => a.name === 'AGI').value).toBe(10);
    expect(migrated.attributes.find((a) => a.name === 'CHA').value).toBe(8);
    expect(migrated.attributes.find((a) => a.name === 'STR').value).toBe(5);
  });

  it('мусорный вход не роняет: без массива атрибутов — как есть', () => {
    expect(migrateAttributeCaps(null)).toBe(null);
    expect(migrateAttributeCaps({})).toEqual({});
    expect(migrateAttributeCaps({ trait: { id: 'shadow' } })).toEqual({ trait: { id: 'shadow' } });
    const state = {
      trait: { id: 'shadow' },
      attributes: [null, { value: 12 }, { name: 'CHA', value: 'не число' }],
    };
    expect(migrateAttributeCaps(state)).toBe(state);
  });
});
