// Приёмочный тест патча 500: канонические 4 попытки, N = 15 + 2·D − ИНТ,
// скобки двух сортов, число скобок задаёт Наука, удача 5–20 %,
// доска «последовательности».
import { describe, expect, it } from 'vitest';
import { getWordsByLength } from '../../server/terminalWords/index.js';
import {
  AMBIGUITY_TARGET_BY_DIFFICULTY,
  BASE_WORDS_BY_DIFFICULTY,
  BRACKET_SPLIT_BY_SCIENCE,
  BRACKET_COUNT_BY_SCIENCE,
  MAX_LIKENESS_BY_DIFFICULTY,
  MIN_AMBIGUITY_BY_DIFFICULTY,
  MIN_SHARED_BY_DIFFICULTY,
  bracketSplitFor,
  applyGameAction,
  attemptsForDifficulty,
  bracketCountFor,
  bracketEffectFor,
  buildPasswordSet,
  createGame,
  passwordWordCount,
  positionalLikeness,
  publicGameState,
  sharedLetters,
  skillBonus,
  skillScore,
} from '../../server/terminalHacking.js';

const snapshot = (int = 4, science = 0, luck = 4, extra = {}) => ({
  attributes: { INT: { value: int }, LCK: { value: luck } },
  skills: [{ id: 'science', rank: science }],
  ...extra,
});
const gameFor = ({ difficulty = 5, int = 4, science = 0, luck = 4, seed = 0.42, extra = {} } = {}) => createGame({
  config: { containerId: 't', difficulty, lockOnFailure: false },
  operatorClientId: 'p',
  operatorCharacterId: 'c',
  characterSnapshot: snapshot(int, science, luck, extra),
  now: 100,
  rng: () => seed,
});
const rngFor = (seed) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

describe('патч 500: число слов, попытки и скобочные пары', () => {
  it('N = max(4, 15 + 2·D − ИНТ), на D5 это «25 − ИНТ»', () => {
    expect(BASE_WORDS_BY_DIFFICULTY).toEqual([11, 13, 15, 17, 19, 21]);
    for (let d = 0; d <= 5; d += 1) {
      expect(passwordWordCount(d, 4)).toBe(11 + 2 * d);
      expect(passwordWordCount(d, 10)).toBe(5 + 2 * d);
      for (let int = 4; int < 10; int += 1) {
        expect(passwordWordCount(d, int + 1)).toBeLessThan(passwordWordCount(d, int));
      }
    }
    expect(passwordWordCount(5, 4)).toBe(21); // «25 − ИНТ»
    expect(passwordWordCount(5, 10)).toBe(15);
    expect(25 - 10).toBe(passwordWordCount(5, 10));
  });

  it('4 попытки на всех сложностях и потолок 4', () => {
    expect([0, 1, 2, 3, 4, 5].map(attemptsForDifficulty)).toEqual([4, 4, 4, 4, 4, 4]);
    for (let d = 0; d <= 5; d += 1) {
      const game = gameFor({ difficulty: d });
      expect(game.attempts).toBe(4);
      expect(game.maxAttempts).toBe(4);
    }
  });

  it('число скобок задаёт Наука на ВСЕХ сложностях', () => {
    expect(BRACKET_SPLIT_BY_SCIENCE).toEqual([[0, 0], [0, 0], [1, 0], [1, 1], [2, 1], [1, 2], [2, 2]]);
    expect(BRACKET_COUNT_BY_SCIENCE).toEqual([0, 1, 1, 2, 3, 3, 4]);
    expect(bracketCountFor(5, 0, 20)).toBe(0);
    expect(bracketCountFor(0, 1, 11)).toBe(1);
    expect(bracketCountFor(5, 6, 20)).toBe(4);
    expect(bracketCountFor(0, 6, 20)).toBe(4); // сложность НЕ ограничивает
    expect(bracketCountFor(5, 6, 4)).toBe(3); // предохранитель N−1
    for (let d = 0; d <= 5; d += 1) {
      for (let sci = 0; sci <= 6; sci += 1) {
        const game = gameFor({ difficulty: d, int: 10, science: sci, luck: 10 });
        expect(game.bracketRanges, `D${d} Наука ${sci}`).toHaveLength(BRACKET_COUNT_BY_SCIENCE[sci]);
        const split = bracketSplitFor(sci);
        if (sci !== 1) {
          expect(game.bracketRanges.filter((b) => b.kind === 'word')).toHaveLength(split[0]);
          expect(game.bracketRanges.filter((b) => b.kind === 'attempt')).toHaveLength(split[1]);
        }
      }
    }
  });

  it('одна скобка = один эффект; удача восстанавливает к 4', () => {
    expect(bracketEffectFor(6, 10, () => 0.99, 'word')).toEqual({ words: 1, attempts: 0, full: false, kind: 'word' });
    expect(bracketEffectFor(6, 10, () => 0.99, 'attempt')).toEqual({ words: 0, attempts: 1, full: false, kind: 'attempt' });
    expect(bracketEffectFor(6, 10, () => 0, 'word')).toEqual({ words: 1, attempts: 0, full: true, kind: 'word' });
    expect(bracketEffectFor(2, 4, () => 0, 'word')).toEqual({ words: 1, attempts: 0, full: true, kind: 'word' });
    expect(bracketEffectFor(1, 4, () => 0, 'word')).toEqual({ words: 0, attempts: 0, full: true, kind: 'word' });
    // Попытки никогда не превышают 4, даже если применены все 4 скобки подряд.
    const game = gameFor({ difficulty: 5, int: 10, science: 6, luck: 10, seed: 0 });
    let next = { ...game, attempts: 1 };
    for (const bracket of game.bracketRanges) {
      next = applyGameAction({
        game: next, action: 'bracket', clientId: 'p', characterId: 'c',
        characterSnapshot: {}, value: bracket.id, now: 101, rng: () => 0,
      }).game;
    }
    expect(next.attempts).toBe(4);
    expect(next.attempts).toBeLessThanOrEqual(next.maxAttempts);
    expect(publicGameState(next).bracketRanges.every((b) => (
      !('effect' in b) && !('recovery' in b) && !('kind' in b)
    ))).toBe(true);
  });

  it('справочная сумма ИНТ + Наука остаётся в границах 4..16', () => {
    expect(skillScore(4, 0)).toBe(4);
    expect(skillScore(10, 6)).toBe(16);
    expect(skillBonus(10, 6)).toBe(12);
  });
});

describe('патч 500: доска «последовательности»', () => {
  it('MIN_SHARED = L−3, предел подсказки из 495, пол неоднозначности поднят на D4–D5', () => {
    expect(MIN_SHARED_BY_DIFFICULTY).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MAX_LIKENESS_BY_DIFFICULTY).toEqual([3, 3, 3, 2, 2, 2]);
    expect(MIN_AMBIGUITY_BY_DIFFICULTY).toEqual([2, 2, 2, 2, 4, 4]);
    expect(AMBIGUITY_TARGET_BY_DIFFICULTY).toEqual([2, 2, 2, 2, 8, 8]);
  });

  it('на всех сложностях слова реальные, почти одинаковые и подсказка ограничена', () => {
    for (let difficulty = 0; difficulty <= 5; difficulty += 1) {
      const game = gameFor({ difficulty, seed: 0.37 });
      const dictionary = new Set(getWordsByLength(game.wordLength));
      const cap = MAX_LIKENESS_BY_DIFFICULTY[difficulty];
      expect(game.likenessCap).toBe(cap);
      expect(game.wordCount).toBe(passwordWordCount(difficulty, 4));
      for (const entry of game.wordRanges) expect(dictionary.has(entry.word)).toBe(true);
      const duds = game.wordRanges.filter((entry) => entry.word !== game.password);
      expect(Math.max(...duds.map((entry) => positionalLikeness(entry.word, game.password)))).toBeLessThanOrEqual(cap);
      expect(new Set(duds.map((entry) => positionalLikeness(entry.word, game.password))).size).toBeGreaterThanOrEqual(2);
      if (difficulty > 0) {
        // Пустышки — «родственники» опорного слова; пароль выбран внутри
        // набора, поэтому смотрим СРЕДНЮЮ близость, а не минимум.
        const common = duds.map((entry) => sharedLetters(entry.word, game.password));
        const average = common.reduce((total, value) => total + value, 0) / common.length;
        expect(average).toBeGreaterThanOrEqual(MIN_SHARED_BY_DIFFICULTY[difficulty] - 2);
        expect(common.filter((value) => value >= MIN_SHARED_BY_DIFFICULTY[difficulty] - 1).length)
          .toBeGreaterThanOrEqual(Math.floor(common.length / 2));
      }
    }
  });

  it('на D4–D5 после любого первого хода остаётся >= 4 кандидатов и пароль не «центральный»', () => {
    for (const difficulty of [4, 5]) {
      for (let k = 1; k <= 8; k += 1) {
        const game = gameFor({ difficulty, int: 10, seed: k / 9 });
        expect(game.minAmbiguity).toBeGreaterThanOrEqual(MIN_AMBIGUITY_BY_DIFFICULTY[difficulty]);
        expect(game.centralityRank).toBeGreaterThan(3);
      }
    }
  });

  it('ни один двухбуквенный префикс не повторяется больше двух раз', () => {
    for (const difficulty of [3, 4, 5]) {
      const selection = buildPasswordSet({
        wordLength: difficulty + 4,
        effectiveDifficulty: difficulty,
        wordCount: passwordWordCount(difficulty, 4),
        rng: () => 0.53,
      });
      const counts = {};
      for (const word of selection.words) counts[word.slice(0, 2)] = (counts[word.slice(0, 2)] || 0) + 1;
      expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
    }
  });

  it('D0: настоящие анаграммы и пароль-выброс, без подчёркивания', () => {
    const game = gameFor({ difficulty: 0, int: 4 });
    const families = new Map();
    for (const entry of game.wordRanges.filter((item) => item.word !== game.password)) {
      const key = [...entry.word].sort().join('');
      families.set(key, (families.get(key) || 0) + 1);
    }
    expect(Math.max(...families.values())).toBeGreaterThanOrEqual(2);
    expect(Math.max(...game.wordRanges.filter((e) => e.word !== game.password)
      .map((e) => sharedLetters(e.word, game.password)))).toBeLessThanOrEqual(2);
    expect(publicGameState(game).wordRanges.some((entry) => entry.isPassword)).toBe(false);
  });

  it('excludeWords убирает слова прошлых досок', () => {
    const first = buildPasswordSet({ wordLength: 9, effectiveDifficulty: 5, wordCount: 15, rng: () => 0.21 });
    const second = buildPasswordSet({
      wordLength: 9, effectiveDifficulty: 5, wordCount: 15, rng: () => 0.22, excludeWords: first.words,
    });
    for (const word of first.words) expect(second.words).not.toContain(word);
    expect(second.wordCount).toBe(15);
  });

  it('Хакер снижает эффективную сложность, число слов и длину пароля', () => {
    const plain = gameFor({ difficulty: 5, int: 10 });
    const hacker = gameFor({ difficulty: 5, int: 10, extra: { selectedPerks: [{ id: 'hacker', rank: 1 }] } });
    expect(plain.effectiveDifficulty).toBe(5);
    expect(hacker.effectiveDifficulty).toBe(4);
    expect(hacker.wordLength).toBe(8);
    expect(hacker.wordCount).toBe(passwordWordCount(4, 10));
    expect(hacker.attempts).toBe(4);
    const zero = gameFor({ difficulty: 1, int: 10, extra: { selectedPerks: [{ id: 'hacker', rank: 5 }] } });
    expect(zero.effectiveDifficulty).toBe(0);
    expect(zero.wordLength).toBe(4);
  });
});

// Приёмка владельца: слепой перебор невелик, думающий >= 80 % без бонусов
// и 100 % при удачных скобках. Скобки тратятся при попытках <= 2 (USE_AT=2).
describe('патч 500: баланс слепого перебора и вдумчивого разбора', () => {
  const play = (game, strategy, rnd) => {
    let g = game;
    let cands = g.wordRanges.filter((w) => !w.removed).map((w) => w.word);
    const brackets = [...g.bracketRanges];
    for (let step = 0; step < 24; step += 1) {
      if (g.status !== 'playing') break;
      const unused = brackets.filter((b) => !g.bracketRanges.find((x) => x.id === b.id).used);
      if (unused.length && g.attempts <= 2) {
        const r = applyGameAction({
          game: g, action: 'bracket', clientId: 'p', characterId: 'c',
          characterSnapshot: {}, value: unused[0].id, now: 101 + step, rng: rnd,
        });
        if (!r.error) g = r.game;
      }
      const live = new Set(cands);
      const available = g.wordRanges.filter((w) => !w.removed && live.has(w.word));
      if (!available.length) break;
      let chosen;
      if (strategy === 'blind') chosen = available[Math.floor(rnd() * available.length)];
      else {
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
  const rate = (difficulty, science, strategy, boards = 24, reps = 6) => {
    let wins = 0, n = 0;
    for (let k = 1; k <= boards; k += 1) {
      const g = gameFor({ difficulty, int: 10, science, luck: 4, seed: k / (boards + 1) });
      for (let x = 0; x < reps; x += 1) {
        if (play(g, strategy, rngFor(k * 7919 + x * 104729))) wins += 1;
        n += 1;
      }
    }
    return Math.round(100 * wins / n);
  };

  it('D5: слепой <= 35 % без бонусов, <= 55 % при Науке 6, думающий >= 80 %', () => {
    const blind0 = rate(5, 0, 'blind');
    const blind6 = rate(5, 6, 'blind');
    const clever0 = rate(5, 0, 'clever');
    const clever6 = rate(5, 6, 'clever');
    expect(blind0).toBeLessThanOrEqual(35);
    expect(blind6).toBeLessThanOrEqual(55);
    expect(clever0).toBeGreaterThanOrEqual(80);
    expect(clever6).toBeGreaterThanOrEqual(90);
  }, 30000);

  it('D4: думающий остаётся в полосе 80–98 % без бонусов', () => {
    const clever = rate(4, 0, 'clever');
    expect(clever).toBeGreaterThanOrEqual(80);
    expect(clever).toBeLessThanOrEqual(98);
  }, 30000);
});
