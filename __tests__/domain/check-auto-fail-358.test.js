// ПРИЁМОЧНЫЙ (патч 358): автопровал проверки — «осложнение + ноль успехов»
// (слово владельца: «И нет успеха, осложнение = автопровал, а не только
// 20 и 20»). Отдельного правила «две двадцатки» в движке больше нет: кубик-
// осложнение (20) успехов не приносит, поэтому 20 и 20 проваливаются сами,
// но автопровал накрывает ЛЮБОЕ осложнение при пустых успехах.
// Пояснения владельца о механизме в целом: последствие провала определяет
// категория/ситуация (химия/алкоголь → зависимость, крафт → потеря
// материалов или время, болезнь → продление), а успехи сверх сложности —
// всегда ОД (в крафте реализовано, патч 324).
import { describe, expect, it } from 'vitest';

import { resolveD20Check } from '../../domain/d20Checks';

const check = (rolls, { attributeValue = 0, skillValue = 6, difficulty = 1, diceCount } = {}) =>
  resolveD20Check({
    attributeValue,
    skillValue,
    difficulty,
    isTagged: false,
    ...(diceCount ? { diceCount } : {}),
    rollD20: () => rolls.shift() ?? 8,
  });

describe('ПРИЁМОЧНЫЙ (патч 358): автопровал = осложнение без успехов', () => {
  it('«20 + промах» — автопровал, хотя двадцатка лишь одна', () => {
    // цель 6: 20 — осложнение (0 успехов), 15 > 6 — успехов нет
    const result = check([20, 15]);
    expect(result.complicationCount).toBe(1);
    expect(result.successes).toBe(0);
    expect(result.automaticFailure).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.outcome).toBe('failure');
  });

  it('«20 и 20» — автопровал (ноль успехов + два осложнения)', () => {
    const result = check([20, 20]);
    expect(result.complicationCount).toBe(2);
    expect(result.successes).toBe(0);
    expect(result.automaticFailure).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('осложнение при успехе — НЕ провал: успех с осложнением', () => {
    // цель 6: 20 — осложнение, 6 — успех
    const result = check([20, 6]);
    expect(result.complicationCount).toBe(1);
    expect(result.successes).toBe(1);
    expect(result.automaticFailure).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.outcome).toBe('successWithComplication');
  });

  it('правило общее, не привязано к числу двадцаток: 3 кубика, две 20 и успех', () => {
    // по старой оговорке «две двадцатки = провал» такой бросок провалился бы;
    // по слову владельца — есть успех (8 ≤ цели 10) → успех с двумя осложнениями
    const result = check([20, 20, 8], { skillValue: 10, difficulty: 1, diceCount: 3 });
    expect(result.complicationCount).toBe(2);
    expect(result.successes).toBe(1);
    expect(result.automaticFailure).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('успехи сверх сложности — база для ОД (закон владельца, в крафте с 324)', () => {
    // цель 6: криты 1 + 1 → 4 успеха; сверх сложности 1 — три успеха лишних
    const result = check([1, 1], { difficulty: 1 });
    expect(result.passed).toBe(true);
    expect(result.successes).toBe(4);
    expect(result.successes - result.difficulty).toBe(3);
  });
});
