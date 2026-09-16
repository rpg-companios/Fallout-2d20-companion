// __tests__/crafting/crafting-engine.test.js
//
// Универсальный движок крафта (патч 251): контракт БЕЗ сеттинга. Рецепты здесь
// — выдуманные id («in_a», «x_out»): если движок замахнется на настоящие
// каталоги, тесты это заметят (проверка импортов в самом конце).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  craftDifficulty,
  resolveOutputQuantity,
  evaluateCraft,
  runCraft,
} from '../../domain/craftingEngine';

const recipe = (over = {}) => ({
  id: 'x_out',
  bench: 'somewhere',
  requires: { skill: 'CRAFT', complexity: 2 },
  materials: [{ itemId: 'in_a', count: 2 }],
  output: { itemId: 'x_out', itemType: 'misc', quantity: 1 },
  ...over,
});

describe('движок крафта: сложность проверки', () => {
  it('сложность рецепта минус ранг навыка, пол — ноль', () => {
    expect(craftDifficulty({ complexity: 4, skillRank: 1 })).toBe(3);
    expect(craftDifficulty({ complexity: 2, skillRank: 2 })).toBe(0);
    expect(craftDifficulty({ complexity: 2, skillRank: 5 })).toBe(0);
  });

  it('ранг накрывает сложность — автоуспех, кубики не бросаются', () => {
    const rollD20 = vi.fn(() => 20);
    const spend = vi.fn(() => ({ ok: true }));
    const grant = vi.fn(() => ({ instanceId: 'inst_1' }));
    const result = runCraft({
      recipe: recipe(),
      skillRank: 2,
      inventoryCounts: { in_a: 2 },
      rollD20,
      spend,
      grant,
    });
    expect(result.done).toBe(true);
    expect(result.auto).toBe(true);
    expect(result.check).toBeNull();
    expect(rollD20).not.toHaveBeenCalled();
    expect(spend).toHaveBeenCalledWith([{ itemId: 'in_a', count: 2 }]);
    expect(result.granted).toEqual({ itemId: 'x_out', quantity: 1, instanceId: 'inst_1' });
  });
});

describe('движок крафта: гейты', () => {
  it('нехватка материала — отказ с деталями, порты не позваны', () => {
    const spend = vi.fn();
    const grant = vi.fn();
    const evaluation = evaluateCraft({
      recipe: recipe({ materials: [{ itemId: 'in_a', count: 3 }, { itemId: 'in_b', count: 1 }] }),
      inventoryCounts: { in_a: 2 },
    });
    expect(evaluation.ready).toBe(false);
    expect(evaluation.blocked).toEqual([
      { code: 'missing-material', itemId: 'in_a', need: 3, have: 2 },
      { code: 'missing-material', itemId: 'in_b', need: 1, have: 0 },
    ]);
    expect(evaluation.materials).toHaveLength(2);

    const result = runCraft({ recipe: recipe(), inventoryCounts: {}, spend, grant });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('gate');
    expect(result.reasons[0].code).toBe('missing-material');
    expect(spend).not.toHaveBeenCalled();
    expect(grant).not.toHaveBeenCalled();
  });

  it('особенность: ранг из map, недостача — причина missing-perk', () => {
    const gated = recipe({ requires: { skill: 'CRAFT', complexity: 2, perks: [{ perkId: 'p_one', rank: 2 }] } });
    expect(evaluateCraft({ recipe: gated, perkRanks: {} }).blocked[0])
      .toEqual({ code: 'missing-perk', perkId: 'p_one', need: 2, have: 0 });
    expect(evaluateCraft({ recipe: gated, perkRanks: { p_one: 1 } }).blocked[0].code).toBe('missing-perk');
    const ready = evaluateCraft({ recipe: gated, perkRanks: { p_one: 2 }, inventoryCounts: { in_a: 2 } });
    expect(ready.ready).toBe(true);
    expect(ready.blocked).toEqual([]);
  });

  it('списание может отказать и позже (стор): сделано не объявляется', () => {
    const result = runCraft({
      recipe: recipe(),
      skillRank: 5,
      inventoryCounts: { in_a: 9 },
      spend: () => ({ ok: false, reason: 'not-enough-items' }),
      grant: vi.fn(),
    });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('store');
    expect(result.reason).toBe('spend-refused');
    expect(result.granted).toBeNull();
  });
});

describe('движок крафта: количество результата', () => {
  it('число — как есть; {base, cd} — база плюс боевые кубики порта', () => {
    expect(resolveOutputQuantity(3)).toBe(3);
    expect(resolveOutputQuantity({ base: 10, cd: 5 }, () => 15)).toBe(25);
    expect(resolveOutputQuantity({ base: 4 }, () => { throw new Error('не нужен'); })).toBe(4);
    expect(() => resolveOutputQuantity({ base: 10, cd: 5 })).toThrow('rollCD');
  });

  it('испорченная форма количества — исключение до любых списаний', () => {
    const spend = vi.fn();
    expect(() => runCraft({
      recipe: recipe({ output: { itemId: 'x_out', quantity: -2 } }),
      skillRank: 9,
      inventoryCounts: { in_a: 2 },
      spend,
      grant: vi.fn(),
    })).toThrow('>= 1');
    expect(spend).not.toHaveBeenCalled();
  });
});

describe('движок крафта: провал проверки', () => {
  const failing = () => ({ rollD20: () => 20 }); // обе кости — осложнения, автопровал

  it('верстак «горит» — материалы списываются, предмет не выдается', () => {
    const spend = vi.fn(() => ({ ok: true }));
    const grant = vi.fn();
    const result = runCraft({
      recipe: recipe({ requires: { skill: 'CRAFT', complexity: 5 } }),
      skillRank: 0,
      inventoryCounts: { in_a: 2 },
      attributeValue: 4,
      failBurnsMaterials: true,
      spend,
      grant,
      ...failing(),
    });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.burned).toEqual([{ itemId: 'in_a', count: 2 }]);
    expect(spend).toHaveBeenCalledTimes(1);
    expect(grant).not.toHaveBeenCalled();
    expect(result.check.complicationCount).toBe(2);
  });

  it('не «горячий» верстак — провал не трогает сумку', () => {
    const spend = vi.fn();
    const grant = vi.fn();
    const result = runCraft({
      recipe: recipe({ requires: { skill: 'CRAFT', complexity: 5 } }),
      skillRank: 0,
      inventoryCounts: { in_a: 2 },
      attributeValue: 4,
      failBurnsMaterials: false,
      spend,
      grant,
      ...failing(),
    });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.spent).toEqual([]);
    expect(spend).not.toHaveBeenCalled();
    expect(grant).not.toHaveBeenCalled();
  });

  it('успех с осложнением — это успех', () => {
    const result = runCraft({
      recipe: recipe({ requires: { skill: 'CRAFT', complexity: 1 } }),
      skillRank: 0, // difficulty 1
      inventoryCounts: { in_a: 2 },
      attributeValue: 10, // любая кость ≤ 10 — успех
      spend: () => ({ ok: true }),
      grant: () => ({ instanceId: 'inst_9' }),
      rollD20: () => 5,
    });
    expect(result.done).toBe(true);
    expect(result.check.outcome).toBe('success');
  });
});

describe('движок крафта: валидация формы и универсальность', () => {
  it('битый рецепт — исключение, а не тихий отказ', () => {
    expect(() => evaluateCraft({ recipe: {} })).toThrow('skill');
    expect(() => evaluateCraft({ recipe: recipe({ materials: [] }) })).toThrow('materials');
    expect(() => evaluateCraft({ recipe: recipe({ materials: [{ itemId: 'in_a', count: 0 }] }) })).toThrow('count');
    expect(() => runCraft({ recipe: recipe() })).toThrow('ports');
  });

  it('движок не знает, где лежит сеттинг: только d20Checks у него в связях', () => {
    const source = readFileSync(new URL('../../domain/craftingEngine.js', import.meta.url), 'utf8');
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) {
      expect(line, line).toMatch(/from '\.\/d20Checks'/);
    }
    expect(source).not.toMatch(/modules\/fallout/);
    expect(source).not.toMatch(/getCraftingRecipeById/);
  });
});
