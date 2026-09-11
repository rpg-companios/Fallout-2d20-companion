import { describe, expect, it } from 'vitest';
import {
  addDiseaseFatigue,
  addFatigue,
  createSurvivalState,
  fatigueSourceBreakdown,
  survivalEffectRows,
} from '../../modules/fallout/survival/survival';

describe('survival: разбивка усталости по источникам (патч 217)', () => {
  it('пустое состояние — пустой список', () => {
    expect(fatigueSourceBreakdown(createSurvivalState('human'))).toEqual([]);
  });

  it('показываются только активные источники (amount > 0)', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'food', 2);
    addFatigue(s, 'sleep', 1);
    addDiseaseFatigue(s, 3);
    expect(fatigueSourceBreakdown(s)).toEqual([
      { source: 'food', amount: 2 },
      { source: 'sleep', amount: 1 },
      { source: 'disease', amount: 3 },
    ]);
  });

  it('канонический порядок: еда, вода, сон, болезнь — независимо от порядка добавления', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'disease', 1);
    addFatigue(s, 'water', 2);
    addFatigue(s, 'food', 1);
    addFatigue(s, 'sleep', 1);
    expect(fatigueSourceBreakdown(s).map((e) => e.source)).toEqual([
      'food',
      'water',
      'sleep',
      'disease',
    ]);
  });

  it('нулевой источник не показывается', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'water', 0);
    addFatigue(s, 'food', 1);
    expect(fatigueSourceBreakdown(s)).toEqual([{ source: 'food', amount: 1 }]);
  });

  it('неизвестный источник идёт в конце списка', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'disease', 1);
    addFatigue(s, 'custom', 4);
    expect(fatigueSourceBreakdown(s).map((e) => e.source)).toEqual([
      'disease',
      'custom',
    ]);
  });

  it('строка «Усталость» несёт источники, остальные строки — нет', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'food', 1);
    addDiseaseFatigue(s, 2);
    const rows = survivalEffectRows(s);
    expect(rows).toEqual([
      {
        key: 'fatigue',
        n: 3,
        sources: [
          { source: 'food', amount: 1 },
          { source: 'disease', amount: 2 },
        ],
      },
      { key: 'apPenalty', n: 3 },
      { key: 'hpPerHour', n: 1 }, // ⌊3/2⌋ — потеря ОЗ за игровой час (патч 232)
    ]);
    expect(rows[1].sources).toBeUndefined();
    expect(rows[2].sources).toBeUndefined();
  });
});
