// Патч 496: «Саммари v2» — скобочные пары как единственные подсказки.
// Сходство N/M узнаётся ТОЛЬКО тратой попытки — этот закон жив.
//
// Патч 549: таблицы 496 приведены к ДЕЙСТВУЮЩЕМУ канону. Прежняя редакция
// требовала законов, отменённых владельцем позже, и падала восемь раз подряд
// (её ошибочно принимали за «известные падения»). Что именно отменено:
//   497 — попыток снова 4 на всех сложностях (не `4 - floor(d/3)`);
//         полный сброс ВОЗВРАЩАЕТ к 4, а не добавляет комплект;
//   499 — число скобок задаёт только Наука: 0,1,1,2,3,3,4 на всех сложностях;
//         одна скобка = один эффект; шанс полного возврата даёт Удача (5–20 %),
//         таблицы d20 `LUCK_EFFECT_BOUNDS` больше нет;
//   500 — доска `N = max(4, 15 + 2·D − ИНТ)`, предохранитель скобок `N−1`;
//   503 — три группы с общими фрагментами (префиксы НАРОЧНО повторяются),
//         подсказка может быть `L−1 из L`.
// Владелец подтвердил 4 попытки на всех сложностях при постановке 549.
// Держатели действующих законов: terminal-hacking-balance-500.test.js,
// terminal-brackets-500.test.js, terminal-groups-503.test.js.
import { describe, expect, it } from 'vitest';
import { getWordsByLength } from '../../server/terminalWords/index.js';
import {
  BASE_WORDS_BY_DIFFICULTY,
  MAX_LIKENESS_BY_DIFFICULTY,
  MIN_WORDS_BY_DIFFICULTY,
  applyGameAction,
  attemptsForDifficulty,
  bracketCountFor,
  bracketEffectFor,
  buildPasswordSet,
  createGame,
  luckRestoreChance,
  recoveryChancePercent,
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
  it('канон 500: N = max(4, 15 + 2·D − ИНТ), на D5 это «25 − ИНТ»', () => {
    expect(BASE_WORDS_BY_DIFFICULTY).toEqual([11, 13, 15, 17, 19, 21]);
    expect(MIN_WORDS_BY_DIFFICULTY).toEqual([4, 4, 4, 4, 4, 4]);
    for (let d = 0; d <= 5; d += 1) {
      for (let int = 4; int <= 10; int += 1) {
        expect(passwordWordCount(d, int)).toBe(Math.max(4, 15 + 2 * d - int));
        if (int < 10) expect(passwordWordCount(d, int + 1)).toBeLessThanOrEqual(passwordWordCount(d, int));
      }
    }
    expect(passwordWordCount(5, 4)).toBe(21);
    expect(passwordWordCount(5, 10)).toBe(15);
    expect(passwordWordCount(1, 10)).toBe(7);
    expect(passwordWordCount(0, 10)).toBe(5);
  });

  it('канон 497: 4 попытки на всех сложностях', () => {
    expect([0, 1, 2, 3, 4, 5].map(attemptsForDifficulty)).toEqual([4, 4, 4, 4, 4, 4]);
    for (let d = 0; d <= 5; d += 1) {
      const game = gameFor({ difficulty: d });
      expect(game.attempts).toBe(4);
      expect(game.maxAttempts).toBe(4);
    }
  });

  it('канон 499/500: число скобок задаёт только Наука, предохранитель N−1', () => {
    // 0,1,1,2,3,3,4 для Науки 0–6 — на любой сложности.
    const byScience = [0, 1, 1, 2, 3, 3, 4];
    for (let d = 0; d <= 5; d += 1) {
      for (let sci = 0; sci <= 6; sci += 1) {
        expect(bracketCountFor(d, sci, 20), `D${d} Наука ${sci}`).toBe(byScience[sci]);
      }
    }
    expect(bracketCountFor(5, 6, 4)).toBe(3); // предохранитель N−1 (канон 500)
    expect(bracketCountFor(0, 6, 20)).toBe(4); // сложность НЕ ограничивает
    for (let d = 0; d <= 5; d += 1) {
      const game = gameFor({ difficulty: d, int: 4, science: 6, luck: 10 });
      expect(game.bracketRanges.length).toBe(bracketCountFor(d, 6, game.wordCount));
      expect(game.bracketRanges.length).toBeLessThanOrEqual(4);
    }
  });

  it('канон 499: полный возврат даёт Удача — 5–20 %, а не таблица d20', () => {
    // Вместо `LUCK_EFFECT_BOUNDS` — вероятность на каждую скобку.
    expect(recoveryChancePercent(4)).toBe(5);
    expect(recoveryChancePercent(7)).toBe(13);
    expect(recoveryChancePercent(10)).toBe(20);
    for (let luck = 4; luck <= 10; luck += 1) {
      expect(luckRestoreChance(luck)).toBeCloseTo(0.05 + 0.025 * (luck - 4), 10);
    }
    // Одна скобка = ровно один эффект (канон 499).
    const dud = bracketEffectFor(6, 4, () => 0.99, 'word');
    expect(dud).toEqual({ words: 1, attempts: 0, full: false, kind: 'word' });
    const step = bracketEffectFor(6, 4, () => 0.99, 'attempt');
    expect(step).toEqual({ words: 0, attempts: 1, full: false, kind: 'attempt' });
    // Удачный бросок даёт полное восстановление и НЕ смешивает эффекты.
    const full = bracketEffectFor(6, 10, () => 0.01, 'attempt');
    expect(full.full).toBe(true);
    expect(full.attempts).toBe(0);
    // Наука 0 — скобок нет.
    expect(bracketEffectFor(0, 10, () => 0).kind).toBe('none');
  });

  it('канон 497/503: полное восстановление ВОЗВРАЩАЕТ к 4 и работает один раз', () => {
    const game = gameFor({ difficulty: 5, int: 10, science: 6, luck: 10 });
    expect(game.bracketRanges.length).toBeGreaterThan(1);
    // Эффект скобки — объект (канон 499), а не строка 'reset'/'dud'.
    const full = { words: 0, attempts: 0, full: true, kind: 'attempt' };
    const dud = { words: 1, attempts: 0, full: false, kind: 'word' };
    const forced = {
      ...game,
      attempts: 1,
      // Две «полные» скобки подряд: вторая обязана выродиться в +1 попытку.
      bracketRanges: game.bracketRanges.map((entry, index) => ({
        ...entry,
        effect: index < 2 ? full : dud,
      })),
    };
    const press = (state, bracket) => applyGameAction({
      game: state,
      action: 'bracket',
      clientId: 'p',
      characterId: 'c',
      characterSnapshot: {},
      value: bracket.id,
      now: 101,
      rng: () => 0,
    }).game;

    const afterFirst = press(forced, forced.bracketRanges[0]);
    expect(afterFirst.resetUsed).toBe(true);
    // Возврат К потолку, а не комплект сверху: было 1 → стало 4, не 5.
    expect(afterFirst.attempts).toBe(forced.maxAttempts);
    expect(afterFirst.attempts).toBe(4);
    expect(afterFirst.result).toBe('ATTEMPTS RESET');

    let next = afterFirst;
    for (const bracket of forced.bracketRanges.slice(1)) next = press(next, bracket);
    // Попытки НИКОГДА не выше 4, повторного полного возврата нет.
    expect(next.attempts).toBeLessThanOrEqual(4);
    expect(next.resetUsed).toBe(true);
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
  it('канон 503: подсказка доходит до L−1 из L и даёт градиент', () => {
    // Таблица 495 осталась только у запасного построителя доски.
    expect(MAX_LIKENESS_BY_DIFFICULTY).toEqual([3, 3, 3, 2, 2, 2]);
    for (let difficulty = 0; difficulty <= 5; difficulty += 1) {
      const game = gameFor({ difficulty, seed: 0.37 });
      const hints = game.wordRanges
        .filter((entry) => entry.word !== game.password)
        .map((entry) => positionalLikeness(entry.word, game.password));
      // 503: предел — длина слова минус буква, а не таблица сложности.
      expect(game.likenessCap).toBe(game.wordLength - 1);
      expect(Math.max(...hints)).toBeLessThanOrEqual(game.likenessCap);
      // Градиент подсказок: не одно flat-значение на всю доску.
      expect(new Set(hints).size).toBeGreaterThanOrEqual(2);
      expect(game.wordCount).toBe(passwordWordCount(difficulty, 4));
    }
    // Три группы и их варианты держит terminal-groups-503.test.js.
  });

  it('канон 503: общие фрагменты нарочные, слова настоящие и не повторяются', () => {
    // Прежний закон 496 («префикс не чаще двух раз») отменён в 503: группа
    // слов строится вокруг ОБЩЕГО фрагмента (THE/THO, TION/SION), поэтому
    // повторы префиксов — признак правильной доски, а не дефект.
    for (const difficulty of [3, 4, 5]) {
      const selection = buildPasswordSet({
        wordLength: difficulty + 4,
        effectiveDifficulty: difficulty,
        wordCount: passwordWordCount(difficulty, 4),
        rng: () => 0.53,
      });
      const dictionary = new Set(getWordsByLength(difficulty + 4));
      for (const word of selection.words) expect(dictionary.has(word)).toBe(true);
      expect(new Set(selection.words).size).toBe(selection.words.length);
      expect(selection.words).toContain(selection.password);
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

  it('Хакер снижает эффективную сложность и число слов, попытки остаются 4', () => {
    const plain = gameFor({ difficulty: 5, int: 10 });
    const hacker = gameFor({ difficulty: 5, int: 10, extra: { selectedPerks: [{ id: 'hacker', rank: 1 }] } });
    expect(plain.effectiveDifficulty).toBe(5);
    expect(hacker.effectiveDifficulty).toBe(4);
    expect(hacker.wordLength).toBe(8);
    expect(hacker.wordCount).toBe(passwordWordCount(4, 10));
    expect(hacker.attempts).toBe(4); // канон 497: 4 на всех сложностях
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
