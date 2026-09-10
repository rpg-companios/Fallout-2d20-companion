// __tests__/perks/perk-attribute-deltas.test.js
//
// Патч 219: очки перков («Интенсивные тренировки») применялись к атрибутам
// от устаревшего массива контекста — дельта повторно начисляла уже
// распределённые очки. Дефект владельца: ловкость 8 + два ранга
// «Интенсивных тренировок» давали 11 вместо 10, а перк «Ган-фу»
// (требование ЛОВ 10) показывал текущую ловкость 8.
//
// Дельта теперь считается от базы стора (planPerkAttributeDeltas).

import { describe, expect, it } from 'vitest';
import { planPerkAttributeDeltas } from '../../domain/perkAttributeChanges';

describe('planPerkAttributeDeltas (патч 219)', () => {
  it('дельта — от базы стора, а не от устаревшего контекста', () => {
    const plan = planPerkAttributeDeltas({
      newAttributes: [{ name: 'AGI', value: 10 }],
      storeAttributes: { AGI: { base: 9, modifiers: [], total: 9 } },
      contextValues: { AGI: 8 },
    });
    expect(plan).toEqual([{ name: 'AGI', delta: 1, baseSource: 'store' }]);
  });

  it('сценарий владельца: два последовательных коммита дают 10, а не 11', () => {
    const store = { AGI: { base: 8 } };
    const context = { AGI: 8 }; // контекст в дефекте не обновлялся

    // Ранг 1: ловкость 8 → 9.
    const first = planPerkAttributeDeltas({
      newAttributes: [{ name: 'AGI', value: 9 }],
      storeAttributes: store,
      contextValues: context,
    });
    expect(first[0].delta).toBe(1);
    store.AGI.base += first[0].delta;

    // Ранг 2: ловкость 9 → 10. При отсчёте от контекста дельта была бы +2,
    // и итог уезжал в 11.
    const second = planPerkAttributeDeltas({
      newAttributes: [{ name: 'AGI', value: 10 }],
      storeAttributes: store,
      contextValues: context,
    });
    expect(second[0].delta).toBe(1);
    expect(store.AGI.base + second[0].delta).toBe(10);
  });

  it('стор не знает атрибут — отсчёт от контекста (поведение как раньше)', () => {
    const plan = planPerkAttributeDeltas({
      newAttributes: [{ name: 'STR', value: 6 }],
      storeAttributes: {},
      contextValues: { STR: 4 },
    });
    expect(plan).toEqual([{ name: 'STR', delta: 2, baseSource: 'context' }]);
  });

  it('нулевая и отрицательная дельты планируются корректно', () => {
    const plan = planPerkAttributeDeltas({
      newAttributes: [
        { name: 'STR', value: 5 },
        { name: 'AGI', value: 7 },
      ],
      storeAttributes: { STR: { base: 5 }, AGI: { base: 8 } },
      contextValues: { STR: 4, AGI: 8 },
    });
    expect(plan).toEqual([
      { name: 'STR', delta: 0, baseSource: 'store' },
      { name: 'AGI', delta: -1, baseSource: 'store' },
    ]);
  });

  it('мусорный вход не роняет план и даёт нулевые дельты', () => {
    expect(planPerkAttributeDeltas({})).toEqual([]);
    const plan = planPerkAttributeDeltas({
      newAttributes: [null, { name: 'AGI', value: 'не число' }, { value: 10 }],
      storeAttributes: { AGI: { base: 5 } },
      contextValues: {},
    });
    expect(plan).toEqual([
      { name: '', delta: 0, baseSource: 'context' },
      { name: 'AGI', delta: 0, baseSource: 'store' },
      { name: '', delta: 0, baseSource: 'context' },
    ]);
  });
});
