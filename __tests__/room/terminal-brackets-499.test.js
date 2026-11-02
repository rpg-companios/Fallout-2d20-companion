// Приёмочный тест 499: скобки двух сортов, число задаёт Наука,
// слепой перебор невелик, думающий выигрывает, удача даёт 100 %.
import { describe, expect, it } from 'vitest';
import {
  BRACKET_COUNT_BY_SCIENCE,
  applyGameAction,
  bracketSplitFor,
  createGame,
  positionalLikeness,
} from '../../server/terminalHacking.js';

const snapshot = (int, sci, luck) => ({
  attributes: { INT: { value: int }, LCK: { value: luck } },
  skills: [{ id: 'science', rank: sci }],
});
const gameFor = (d, int, sci, luck, seed) => createGame({
  config: { containerId: 't', difficulty: d, lockOnFailure: false },
  operatorClientId: 'p', operatorCharacterId: 'c',
  characterSnapshot: snapshot(int, sci, luck), now: 100, rng: () => seed,
});
const rngFor = (seed) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

const play = (game, strategy, rnd) => {
  let g = game;
  let cands = g.wordRanges.filter((w) => !w.removed).map((w) => w.word);
  const ids = [...g.bracketRanges].map((b) => b.id);
  for (let step = 0; step < 28; step += 1) {
    if (g.status !== 'playing') break;
    const unused = ids.filter((id) => !g.bracketRanges.find((x) => x.id === id).used);
    if (unused.length && g.attempts <= 2) {
      const r = applyGameAction({
        game: g, action: 'bracket', clientId: 'p', characterId: 'c',
        characterSnapshot: {}, value: unused[0], now: 101 + step, rng: rnd,
      });
      if (!r.error) g = r.game;
    }
    const live = new Set(cands);
    const available = g.wordRanges.filter((w) => !w.removed && live.has(w.word));
    if (!available.length) break;
    let chosen = available[Math.floor(rnd() * available.length)];
    if (strategy === 'clever') {
      const list = cands.filter((w) => available.some((a) => a.word === w));
      chosen = available.find((a) => a.word === list[Math.floor(rnd() * list.length)]) || available[0];
    }
    const r = applyGameAction({
      game: g, action: 'guess', clientId: 'p', characterId: 'c',
      characterSnapshot: {}, value: chosen.id, now: 200 + step, rng: rnd,
    });
    if (r.error) break;
    g = r.game;
    if (strategy === 'clever') {
      const last = g.guesses[g.guesses.length - 1];
      if (last) cands = cands.filter((w) => w !== chosen.word && positionalLikeness(chosen.word, w) === last.likeness);
    }
  }
  return g.status === 'won';
};
const rate = (d, sci, strategy, forcedFull = false, boards = 20, reps = 6) => {
  let wins = 0, n = 0;
  for (let k = 1; k <= boards; k += 1) {
    let g = gameFor(d, 10, sci, 4, k / (boards + 1));
    if (forcedFull) {
      g = {
        ...g,
        bracketRanges: g.bracketRanges.map((b) => ({
          ...b,
          effect: { words: b.kind === 'word' ? 1 : 0, attempts: 0, full: true, kind: b.kind },
        })),
      };
    }
    for (let x = 0; x < reps; x += 1) {
      if (play(g, strategy, rngFor(k * 7919 + x * 104729))) wins += 1;
      n += 1;
    }
  }
  return Math.round(100 * wins / n);
};

describe('патч 499: скобки двух сортов', () => {
  it('число и состав скобок не зависят от сложности', () => {
    for (let sci = 0; sci <= 6; sci += 1) {
      const counts = [];
      for (let d = 0; d <= 5; d += 1) {
        const g = gameFor(d, 10, sci, 4, 0.42);
        counts.push(g.bracketRanges.length);
        const split = bracketSplitFor(sci);
        if (sci !== 1) {
          expect(g.bracketRanges.filter((b) => b.kind === 'word')).toHaveLength(split[0]);
          expect(g.bracketRanges.filter((b) => b.kind === 'attempt')).toHaveLength(split[1]);
        }
        // Одна скобка = один эффект (до удачи).
        for (const b of g.bracketRanges) {
          expect(b.effect.words + b.effect.attempts).toBeLessThanOrEqual(1);
        }
      }
      expect(new Set(counts).size).toBe(1);
      expect(counts[0]).toBe(BRACKET_COUNT_BY_SCIENCE[sci]);
    }
  });

  it('на сложности 5 при Науке 6 слепой <= 40 %, думающий >= 85 %', () => {
    expect(rate(5, 6, 'blind')).toBeLessThanOrEqual(40);
    expect(rate(5, 6, 'clever')).toBeGreaterThanOrEqual(85);
  }, 30000);

  it('удачное полное восстановление доводит думающего до 100 %', () => {
    expect(rate(5, 6, 'clever', true)).toBe(100);
  }, 30000);

  it('на сложности 1 при Науке 6 + ИНТ 10 взлом лёгкий для думающего', () => {
    expect(rate(1, 6, 'clever')).toBeGreaterThanOrEqual(95);
  }, 30000);
});
