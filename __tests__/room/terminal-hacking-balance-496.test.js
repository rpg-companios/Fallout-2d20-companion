// Патч 496: «Саммари v2» — скобочные пары как единственные подсказки.
//   N = max(Мин_N[d], База_N[d] - (ИНТ - 4))
//   T = 4 - floor(d / 3)
//   P = max(0, min(1 + floor(Наука/2) - floor(d/3), 3, N - 3))
//   d20 по УДЧ решает эффект: полный сброс / +1 попытка / удаление пустышки.
//   Сходство N/M узнаётся ТОЛЬКО тратой попытки.
import { describe, expect, it } from 'vitest';
import { getWordsByLength } from '../../server/terminalWords/index.js';
import {
  BASE_WORDS_BY_DIFFICULTY,
  LUCK_EFFECT_BOUNDS,
  MAX_LIKENESS_BY_DIFFICULTY,
  MIN_WORDS_BY_DIFFICULTY,
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

describe('патч 496: таблицы числа слов, попыток и скобочных пар', () => {
  it('N = max(Мин_N, База_N - (ИНТ-4)) для всех сложностей', () => {
    expect(BASE_WORDS_BY_DIFFICULTY).toEqual([8, 10, 12, 14, 17, 20]);
    expect(MIN_WORDS_BY_DIFFICULTY).toEqual([4, 5, 6, 7, 9, 10]);
    for (let d = 0; d <= 5; d += 1) {
      expect(passwordWordCount(d, 4)).toBe(BASE_WORDS_BY_DIFFICULTY[d]);
      expect(passwordWordCount(d, 10)).toBe(Math.max(MIN_WORDS_BY_DIFFICULTY[d], BASE_WORDS_BY_DIFFICULTY[d] - 6));
      for (let int = 4; int < 10; int += 1) {
        expect(passwordWordCount(d, int + 1)).toBeLessThanOrEqual(passwordWordCount(d, int));
      }
    }
    expect(passwordWordCount(5, 10)).toBe(14);
    expect(passwordWordCount(0, 10)).toBe(4);
  });

  it('T = 4 - floor(d/3): 4 попытки на d0..d2 и 3 на d3..d5', () => {
    expect([0, 1, 2, 3, 4, 5].map(attemptsForDifficulty)).toEqual([4, 4, 4, 3, 3, 3]);
    for (let d = 0; d <= 5; d += 1) {
      const game = gameFor({ difficulty: d });
      expect(game.attempts).toBe(attemptsForDifficulty(d));
      expect(game.maxAttempts).toBe(attemptsForDifficulty(d));
    }
  });

  it('P = max(0, min(1 + floor(Наука/2) - floor(d/3), 3, N-3))', () => {
    expect(bracketCountFor(0, 0, 8)).toBe(1);
    expect(bracketCountFor(0, 3, 8)).toBe(2);
    expect(bracketCountFor(0, 6, 8)).toBe(3);
    expect(bracketCountFor(5, 0, 20)).toBe(0);
    expect(bracketCountFor(5, 3, 14)).toBe(1);
    expect(bracketCountFor(5, 4, 14)).toBe(2);
    expect(bracketCountFor(5, 6, 14)).toBe(3);
    expect(bracketCountFor(5, 6, 4)).toBe(1); // предохранитель N-3
    expect(bracketCountFor(5, 6, 5)).toBe(2);
    for (let d = 0; d <= 5; d += 1) {
      const game = gameFor({ difficulty: d, int: 4, science: 6, luck: 10 });
      expect(game.bracketRanges.length).toBe(bracketCountFor(d, 6, game.wordCount));
      expect(game.bracketRanges.length).toBeLessThanOrEqual(3);
    }
  });

  it('d20 по УДЧ 4..10: границы дают ровно 20 исходов', () => {
    const expected = {
      4: [1, 5], 5: [1, 6], 6: [2, 7], 7: [2, 9],
      8: [3, 10], 9: [3, 12], 10: [4, 15],
    };
    expect(LUCK_EFFECT_BOUNDS).toEqual(expected);
    for (const [luck, [full, plus]] of Object.entries(expected)) {
      const tally = { reset: 0, attempt: 0, dud: 0 };
      for (let roll = 1; roll <= 20; roll += 1) tally[bracketEffectFor(Number(luck), roll)] += 1;
      expect(tally.reset).toBe(full);
      expect(tally.attempt).toBe(plus - full);
      expect(tally.dud).toBe(20 - plus);
      expect(tally.reset + tally.attempt + tally.dud).toBe(20);
    }
    // Повторный «сброс» считается как +1 попытка.
    expect(bracketEffectFor(10, 1, true)).toBe('attempt');
  });

  it('полный сброс даёт ещё один комплект попыток и работает один раз', () => {
    const game = gameFor({ difficulty: 5, int: 10, science: 6, luck: 10 });
    const forced = {
      ...game,
      attempts: 1,
      bracketRanges: game.bracketRanges.map((entry, index) => ({ ...entry, effect: index === 0 ? 'reset' : 'dud' })),
    };
    let next = forced;
    for (const bracket of forced.bracketRanges) {
      next = applyGameAction({
        game: next,
        action: 'bracket',
        clientId: 'p',
        characterId: 'c',
        characterSnapshot: {},
        value: bracket.id,
        now: 101,
        rng: () => 0,
      }).game;
    }
    expect(next.resetUsed).toBe(true);
    expect(next.bonusAttempts).toBe(forced.maxAttempts);
    expect(next.attempts).toBe(1 + forced.maxAttempts);
    expect(next.result).toBe('DUD REMOVED');
  });

  it('скобки не раскрывают свой эффект в публичном состоянии', () => {
    const game = gameFor({ difficulty: 5, int: 10, science: 6, luck: 10 });
    const publicState = publicGameState(game);
    expect(publicState.bracketRanges.every((entry) => !('effect' in entry) && !('recovery' in entry))).toBe(true);
    expect(publicState.password).toBeUndefined();
    expect(publicState.wordRanges.every((entry) => !('isPassword' in entry))).toBe(true);
  });

  it('справочная сумма ИНТ + Наука остаётся в границах 4..16', () => {
    expect(skillScore(4, 0)).toBe(4);
    expect(skillScore(10, 6)).toBe(16);
    expect(skillScore(99, 99)).toBe(16);
    expect(skillBonus(4, 0)).toBe(0);
    expect(skillBonus(10, 6)).toBe(12);
  });
});

describe('патч 496: структура доски', () => {
  it('на каждой сложности три буквенные группы и потолок подсказки из 495', () => {
    expect(MAX_LIKENESS_BY_DIFFICULTY).toEqual([3, 3, 3, 2, 2, 2]);
    for (let difficulty = 0; difficulty <= 5; difficulty += 1) {
      const game = gameFor({ difficulty, seed: 0.37 });
      const cap = MAX_LIKENESS_BY_DIFFICULTY[difficulty];
      const hints = game.wordRanges
        .filter((entry) => entry.word !== game.password)
        .map((entry) => positionalLikeness(entry.word, game.password));
      expect(game.likenessCap).toBe(cap);
      expect(Math.max(...hints)).toBeLessThanOrEqual(cap);
      expect(new Set(hints).size).toBeGreaterThanOrEqual(2);
      expect(game.wordCount).toBe(passwordWordCount(difficulty, 4));
      if (difficulty > 0) expect(game.groupKinds).toBe(3);
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

  it('пароль не «торчит» из доски по сумме общих букв', () => {
    let topThree = 0;
    for (let k = 1; k <= 12; k += 1) {
      const selection = buildPasswordSet({ wordLength: 9, effectiveDifficulty: 5, wordCount: 14, rng: () => k / 13 });
      const sums = selection.words.map((x) => selection.words.reduce(
        (total, w) => total + (w === x ? 0 : sharedLetters(x, w)), 0,
      ));
      const own = sums[selection.words.indexOf(selection.password)];
      if (sums.filter((value) => value > own).length < 3) topThree += 1;
    }
    expect(topThree).toBeLessThanOrEqual(4);
  });

  it('d0: настоящие анаграммы и пароль-выброс, без подчёркивания', () => {
    const game = gameFor({ difficulty: 0, int: 4 });
    const families = new Map();
    for (const entry of game.wordRanges.filter((item) => item.word !== game.password)) {
      const key = [...entry.word].sort().join('');
      families.set(key, (families.get(key) || 0) + 1);
    }
    expect(Math.max(...families.values())).toBeGreaterThanOrEqual(2);
    expect(publicGameState(game).wordRanges.some((entry) => entry.isPassword)).toBe(false);
  });

  it('excludeWords убирает слова прошлых досок, словарь остаётся своим', () => {
    const dictionary = new Set(getWordsByLength(9));
    const first = buildPasswordSet({ wordLength: 9, effectiveDifficulty: 5, wordCount: 14, rng: () => 0.21 });
    const second = buildPasswordSet({
      wordLength: 9, effectiveDifficulty: 5, wordCount: 14, rng: () => 0.22, excludeWords: first.words,
    });
    for (const word of first.words) expect(second.words).not.toContain(word);
    for (const word of second.words) expect(dictionary.has(word)).toBe(true);
    expect(dictionary.has('STOOF')).toBe(false);
    expect(dictionary.size).toBeGreaterThan(1000);
  });

  it('Хакер снижает эффективную сложность, число слов и число попыток', () => {
    const plain = gameFor({ difficulty: 5, int: 10 });
    const hacker = gameFor({ difficulty: 5, int: 10, extra: { selectedPerks: [{ id: 'hacker', rank: 1 }] } });
    expect(plain.effectiveDifficulty).toBe(5);
    expect(hacker.effectiveDifficulty).toBe(4);
    expect(hacker.wordLength).toBe(8);
    expect(hacker.wordCount).toBe(passwordWordCount(4, 10));
    expect(hacker.attempts).toBe(3);
    const zero = gameFor({ difficulty: 1, int: 10, extra: { selectedPerks: [{ id: 'hacker', rank: 5 }] } });
    expect(zero.effectiveDifficulty).toBe(0);
    expect(zero.attempts).toBe(4);
    expect(zero.wordLength).toBe(4);
  });
});

// Приёмочный прогон владельца: бездумный перебор почти не выигрывает,
// думающий игрок (>=80 %) — выигрывает, удачный сброс — 100 %.
describe('патч 496: баланс бездумного перебора и вдумчивого разбора', () => {
  const rngFor = (seed) => {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };
  const useBrackets = (game, rnd) => {
    let g = game;
    for (const bracket of game.bracketRanges) {
      const result = applyGameAction({
        game: g, action: 'bracket', clientId: 'p', characterId: 'c',
        characterSnapshot: {}, value: bracket.id, now: 101, rng: rnd,
      });
      if (!result.error) g = result.game;
    }
    return g;
  };
  const play = (game, strategy, rnd) => {
    let g = game;
    let pool = g.wordRanges.filter((entry) => !entry.removed && !entry.guessed).map((entry) => entry.word);
    for (let step = 0; step < 12; step += 1) {
      if (g.status !== 'playing') break;
      const live = new Set(pool);
      const available = g.wordRanges.filter((entry) => !entry.removed && !entry.guessed && live.has(entry.word));
      if (!available.length) break;
      let chosen;
      if (strategy === 'blind') {
        chosen = available[Math.floor(rnd() * available.length)];
      } else {
        let best = null;
        for (const x of available) {
          const buckets = {};
          for (const w of available) {
            if (w.word === x.word) continue;
            const hint = positionalLikeness(x.word, w.word);
            buckets[hint] = (buckets[hint] || 0) + 1;
          }
          const worst = Math.max(0, ...Object.values(buckets));
          if (!best || worst < best.worst) best = { worst, ties: [x] };
          else if (worst === best.worst) best.ties.push(x);
        }
        chosen = best.ties[Math.floor(rnd() * best.ties.length)];
      }
      const result = applyGameAction({
        game: g, action: 'guess', clientId: 'p', characterId: 'c',
        characterSnapshot: {}, value: chosen.id, now: 102 + step, rng: rnd,
      });
      if (result.error) break;
      g = result.game;
      if (strategy === 'clever' && g.status === 'playing') {
        const last = g.guesses[g.guesses.length - 1];
        pool = pool.filter((word) => word !== chosen.word && positionalLikeness(chosen.word, word) === last.likeness);
      }
    }
    return g.status === 'won';
  };

  it('d5 ИНТ10/Наука3/УДЧ4: перебор <=55 %, разбор >=75 %, сброс — 100 %', () => {
    const boards = 24;
    let blind = 0;
    let clever = 0;
    let boostedWins = 0;
    for (let k = 1; k <= boards; k += 1) {
      const base = gameFor({ difficulty: 5, int: 10, science: 3, luck: 4, seed: k / (boards + 1) });
      const game = useBrackets(base, rngFor(k * 7919));
      if (play(game, 'blind', rngFor(k * 9781))) blind += 1;
      if (play(game, 'clever', rngFor(k * 13567))) clever += 1;
      // Удачный полный сброс: ещё один комплект попыток -> 100 % у думающего.
      const boosted = { ...game, attempts: game.attempts + game.maxAttempts, resetUsed: true };
      if (play(boosted, 'clever', rngFor(k * 13567))) boostedWins += 1;
    }
    expect(blind).toBeLessThanOrEqual(Math.round(boards * 0.55));
    expect(clever).toBeGreaterThanOrEqual(Math.round(boards * 0.75));
    expect(boostedWins).toBeGreaterThanOrEqual(boards - 1);
  }, 30000);
});
