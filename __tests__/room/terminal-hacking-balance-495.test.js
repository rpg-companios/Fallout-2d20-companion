// ПРИЁМОЧНЫЙ (патч 495): три характеристики — три рычага.
//
// Владелец: «ИНТ влияет на кол-во слов, Наука на скобочные варианты и на их
// количество, Удача на появление строки кода для восстановления попыток»;
// «Сначала случайным образом выбирается секретное слово из словаря. Затем из
// этого же словаря подбираются другие слова, чтобы создать пустышки с разной
// степенью сходства (likeness) с паролем»; на d=0 «очень много слов-анаграмм,
// а слово-ответ не похоже на них максимально».
import { describe, expect, it } from 'vitest';
import {
  applyGameAction,
  bracketCountFor,
  buildPasswordSet,
  createGame,
  passwordWordCount,
  positionalLikeness,
  recoveryChancePercent,
  sharedLetters,
  skillBonus,
  skillScore,
} from '../../server/terminalHacking.js';
import { getWordsByLength, manifest } from '../../server/terminalWords/index.js';

const config = (difficulty) => ({ containerId: 'terminal-1', name: 'Vault terminal', difficulty, lockOnFailure: true });
const snapshot = (intelligence, science, luck = 4) => ({
  attributes: { INT: { value: intelligence }, LCK: { value: luck } },
  skills: [{ id: 'science', rank: science }],
});
const gameFor = (difficulty, intelligence, science, luck, seed) => createGame({
  config: config(difficulty),
  operatorClientId: 'player-1',
  operatorCharacterId: 'char-1',
  characterSnapshot: snapshot(intelligence, science, luck),
  now: 100,
  rng: () => seed,
});

const CAP = [3, 3, 3, 2, 2, 2];
const MIN_AMBIGUITY = [3, 3, 3, 3, 3, 4];

describe('патч 495: ИНТ (4..10) задаёт число слов, Наука и Удача — свои рычаги', () => {
  it('справочная сумма ИНТ + Наука остаётся в границах 4..16', () => {
    expect(skillScore(4, 0)).toBe(4);
    expect(skillScore(10, 6)).toBe(16);
    expect(skillScore(1, -5)).toBe(4);
    expect(skillScore(99, 99)).toBe(16);
    expect(skillBonus(4, 0)).toBe(0);
    expect(skillBonus(10, 6)).toBe(12);
  });

  it('база 20 слов, ИНТ 10 даёт 12; сложность и Наука на число слов не влияют', () => {
    expect(passwordWordCount(0, 4)).toBe(20);
    expect(passwordWordCount(5, 4)).toBe(20);
    expect(passwordWordCount(5, 10)).toBe(12);
    expect(passwordWordCount(5, 10, 6)).toBe(12);
    expect([4, 5, 6, 7, 8, 9, 10].map((int) => passwordWordCount(5, int)))
      .toEqual([20, 19, 17, 16, 15, 13, 12]);
    for (const difficulty of [0, 1, 2, 3, 4, 5]) {
      let previous = Infinity;
      for (let int = 4; int <= 10; int += 1) {
        const count = passwordWordCount(difficulty, int);
        expect(count).toBeLessThanOrEqual(previous);
        expect(count).toBeGreaterThanOrEqual(6);
        previous = count;
      }
    }
  });

  it('Наука 0..6 даёт 2..8 скобок, синергия ИНТ>=8 и Науки>=4 добавляет ещё одну', () => {
    expect(bracketCountFor(4, 0)).toBe(2);
    expect(bracketCountFor(4, 3)).toBe(5);
    expect(bracketCountFor(4, 6)).toBe(8);
    expect(bracketCountFor(10, 6)).toBe(9);
    expect(bracketCountFor(7, 6)).toBe(8);
  });

  it('Удача 4..10 даёт 10..80 % и никогда не даёт ноль', () => {
    expect([4, 5, 6, 7, 8, 9, 10].map((luck) => Math.round(recoveryChancePercent(luck))))
      .toEqual([10, 22, 33, 45, 57, 68, 80]);
    expect(recoveryChancePercent(0)).toBe(10);
    expect(recoveryChancePercent(99)).toBe(80);
  });

  it('восстанавливающие комбинации появляются только с Науки 4', () => {
    for (const science of [0, 1, 2, 3]) {
      const game = gameFor(3, 10, science, 10, 0);
      expect(game.bracketRanges.filter((entry) => entry.recovery)).toHaveLength(0);
      expect(game.restoreSlots).toBe(0);
    }
    for (const science of [4, 5, 6]) {
      const game = gameFor(3, 10, science, 10, 0);
      expect(game.bracketRanges.filter((entry) => entry.recovery).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('восстановление даёт +1 попытку и не превышает максимум', () => {
    const game = gameFor(3, 10, 6, 10, 0);
    const bracket = game.bracketRanges.find((entry) => entry.recovery);
    const fromTwo = applyGameAction({
      game: { ...game, attempts: 2 },
      action: 'bracket',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot: {},
      value: bracket.id,
      now: 101,
      rng: () => 0,
    }).game;
    expect(fromTwo.attempts).toBe(3);
    const fromMax = applyGameAction({
      game,
      action: 'bracket',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot: {},
      value: bracket.id,
      now: 101,
      rng: () => 0,
    }).game;
    expect(fromMax.attempts).toBe(4);
  });
});

describe('патч 495: словарь и порядок «пароль -> пустышки»', () => {
  it('шесть файлов по длине, только реальные слова, без STOOF', () => {
    const all = new Set();
    for (const length of manifest.wordLengths) {
      const words = getWordsByLength(length);
      expect(words.length).toBeGreaterThan(1000);
      for (const word of words) expect(word).toMatch(new RegExp(`^[A-Z]{${length}}$`));
      words.forEach((word) => all.add(word));
    }
    expect(all.has('STOOF')).toBe(false);
    for (const word of ['STEPS', 'DROPS', 'CROSS', 'SCORE', 'COURSE', 'FOOTS', 'BOOTS', 'BOOST', 'STUFF', 'DICE', 'POST', 'SPOT', 'STOP', 'POTS', 'OPTS']) {
      expect(all.has(word), `нет слова ${word}`).toBe(true);
    }
  });

  it('пустышки берутся из того же словаря, что и пароль, и дают разную подсказку', () => {
    for (const difficulty of [1, 2, 3, 4, 5]) {
      const length = difficulty + 4;
      const dictionary = new Set(getWordsByLength(length));
      const selection = buildPasswordSet({
        wordLength: length,
        effectiveDifficulty: difficulty,
        wordCount: 12,
        rng: () => 0.41,
      });
      expect(dictionary.has(selection.password)).toBe(true);
      for (const word of selection.words) expect(dictionary.has(word)).toBe(true);
      const hints = selection.words
        .filter((word) => word !== selection.password)
        .map((word) => positionalLikeness(word, selection.password));
      expect(new Set(hints).size).toBeGreaterThanOrEqual(2);
      expect(Math.max(...hints)).toBeLessThanOrEqual(CAP[difficulty]);
    }
  });

  it('d=0: много настоящих анаграмм, пароль — выброс с минимальным пересечением', () => {
    const game = gameFor(0, 4, 0, 4, 0.37);
    const words = game.wordRanges.map((entry) => entry.word);
    const families = new Map();
    for (const word of words) {
      const key = [...word].sort().join('');
      families.set(key, (families.get(key) || 0) + 1);
    }
    expect(Math.max(...families.values())).toBeGreaterThanOrEqual(3);
    expect([...families.values()].filter((size) => size >= 2).length).toBeGreaterThanOrEqual(3);
    const decoys = words.filter((word) => word !== game.password);
    expect(Math.max(...decoys.map((word) => sharedLetters(word, game.password)))).toBeLessThanOrEqual(2);
    expect(Math.max(...decoys.map((word) => positionalLikeness(word, game.password)))).toBeLessThanOrEqual(1);
  });

  it('excludeWords убирает слова предыдущих досок с этой же длины', () => {
    const first = buildPasswordSet({ wordLength: 9, effectiveDifficulty: 5, wordCount: 12, rng: () => 0.2 });
    const second = buildPasswordSet({
      wordLength: 9,
      effectiveDifficulty: 5,
      wordCount: 12,
      rng: () => 0.2,
      excludeWords: first.words,
    });
    for (const word of first.words) expect(second.words).not.toContain(word);
  });
});

describe('патч 495: подсказка ограничена, угадать за две попытки нельзя', () => {
  it.each([0, 1, 2, 3, 4, 5])('сложность %s: потолок подсказки и запас кандидатов', (difficulty) => {
    const stats = [[4, 0, 4], [7, 3, 7], [10, 6, 10]];
    for (const [intelligence, science, luck] of stats) {
      for (let step = 1; step <= 12; step += 1) {
        const game = gameFor(difficulty, intelligence, science, luck, step / 13);
        const decoys = game.wordRanges.filter((entry) => entry.word !== game.password);
        expect(decoys.length).toBeGreaterThan(0);
        expect(game.wordCount).toBe(game.wordRanges.length);
        expect(game.wordCount).toBe(passwordWordCount(difficulty, intelligence));
        expect(game.likenessCap).toBe(CAP[difficulty]);
        expect(game.skillScore).toBe(intelligence + science);
        expect(game.board).toHaveLength(408);
        expect(game.wordRanges.some((entry) => entry.isPassword)).toBe(true);

        const hints = decoys.map((entry) => positionalLikeness(entry.word, game.password));
        expect(Math.max(...hints)).toBeLessThanOrEqual(CAP[difficulty]);
        expect(new Set(hints).size).toBeGreaterThanOrEqual(2);
        if (difficulty >= 3) {
          expect(Math.min(...decoys.map((entry) => sharedLetters(entry.word, game.password))))
            .toBeGreaterThanOrEqual(3);
        }

        for (const guess of decoys) {
          const hint = positionalLikeness(guess.word, game.password);
          const candidates = game.wordRanges.filter((entry) => (
            entry.word !== guess.word && positionalLikeness(guess.word, entry.word) === hint
          ));
          expect(candidates.length).toBeGreaterThanOrEqual(MIN_AMBIGUITY[difficulty]);
        }
      }
    }
  }, 30000);

  it('сценарий владельца: сложность 5, ИНТ 4, Наука 0 — 20 слов, максимум 2/9', () => {
    const game = gameFor(5, 4, 0, 4, 0.37);
    expect(game.wordLength).toBe(9);
    expect(game.wordCount).toBe(20);
    expect(game.likenessCap).toBe(2);
    expect(game.bracketRanges).toHaveLength(2);
    expect(game.bracketRanges.filter((entry) => entry.recovery)).toHaveLength(0);
    const hints = game.wordRanges
      .filter((entry) => entry.word !== game.password)
      .map((entry) => positionalLikeness(entry.word, game.password));
    expect(Math.max(...hints)).toBeLessThanOrEqual(2);
    expect(Math.max(...hints)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...hints)).toBeLessThan(Math.max(...hints));

    const wrong = game.wordRanges.find((entry) => !entry.isPassword);
    const result = applyGameAction({
      game,
      action: 'guess',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot: snapshot(4, 0),
      value: wrong.id,
      now: 101,
      rng: () => 0,
    });
    expect(result.game.guesses[0]).toEqual({
      word: wrong.word,
      likeness: positionalLikeness(wrong.word, game.password),
    });
    expect(result.game.guesses[0].likeness).toBeLessThanOrEqual(2);
    expect(result.game.attempts).toBe(3);
  });
});
