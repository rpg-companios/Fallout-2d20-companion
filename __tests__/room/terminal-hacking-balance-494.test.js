// ПРИЁМОЧНЫЙ (патч 494): баланс взлома по мотивам Fallout 3 / New Vegas.
// Владелец: «Нельзя столько совпадений букв давать за раз… слова должны быть
// похожими и совпадать на высокой сложности небольшое количество букв…
// чем выше показатель, тем меньше слов надо перебирать».
import { describe, expect, it } from 'vitest';
import {
  applyGameAction,
  createGame,
  passwordWordCount,
  positionalLikeness,
  recoveryChancePercent,
  sharedLetters,
  skillBonus,
  skillScore,
} from '../../server/terminalHacking.js';

const config = (difficulty) => ({ containerId: 'terminal-1', name: 'Vault terminal', difficulty, lockOnFailure: true });
const snapshot = (intelligence, science) => ({
  attributes: { INT: { value: intelligence } },
  skills: [{ id: 'science', value: science }],
});
const gameFor = (difficulty, intelligence, science, seed) => createGame({
  config: config(difficulty),
  operatorClientId: 'player-1',
  operatorCharacterId: 'char-1',
  characterSnapshot: snapshot(intelligence, science),
  now: 100,
  rng: () => seed,
});

const CAP = [3, 3, 3, 2, 2, 2];
const MIN_AMBIGUITY = [3, 3, 3, 3, 3, 4];

describe('патч 494: ИНТ + Наука (4..16) сокращают список слов', () => {
  it('очки навыка считаются в заявленных границах', () => {
    expect(skillScore(4, 0)).toBe(4);
    expect(skillScore(10, 6)).toBe(16);
    expect(skillScore(1, -5)).toBe(4);
    expect(skillScore(99, 99)).toBe(16);
    expect(skillBonus(4, 0)).toBe(0);
    expect(skillBonus(10, 6)).toBe(12);
  });

  it('чем выше показатель, тем меньше слов; сложность 5 остаётся сложной', () => {
    expect(passwordWordCount(0, 4, 0)).toBe(12);
    expect(passwordWordCount(0, 7, 3)).toBe(9);
    expect(passwordWordCount(0, 10, 6)).toBe(6);
    expect(passwordWordCount(5, 4, 0)).toBe(13);
    expect(passwordWordCount(5, 10, 6)).toBe(12);
    for (const difficulty of [0, 1, 2, 3, 4, 5]) {
      let previous = Infinity;
      for (let score = 4; score <= 16; score += 1) {
        const intelligence = Math.min(10, score);
        const science = Math.max(0, score - intelligence);
        const count = passwordWordCount(difficulty, intelligence, science);
        expect(count).toBeLessThanOrEqual(previous);
        expect(count).toBeGreaterThanOrEqual(6);
        previous = count;
      }
    }
  });

  it('старый бонус на восстановление попыток сохранён', () => {
    expect(recoveryChancePercent(4, 0)).toBe(0);
    expect(recoveryChancePercent(10, 6)).toBe(80);
  });
});

describe('патч 494: подсказка ограничена, слова похожи, угадать за две попытки нельзя', () => {
  it.each([0, 1, 2, 3, 4, 5])('сложность %s: потолок подсказки и запас кандидатов', (difficulty) => {
    const stats = [[4, 0], [7, 3], [10, 6]];
    for (const [intelligence, science] of stats) {
      for (let step = 1; step <= 12; step += 1) {
        const game = gameFor(difficulty, intelligence, science, step / 13);
        const decoys = game.wordRanges.filter((entry) => entry.word !== game.password);
        expect(decoys.length).toBeGreaterThan(0);
        expect(game.wordCount).toBe(game.wordRanges.length);
        expect(game.likenessCap).toBe(CAP[difficulty]);
        expect(game.skillScore).toBe(intelligence + science);
        expect(game.board).toHaveLength(408);
        expect(game.wordRanges.some((entry) => entry.isPassword)).toBe(true);

        const hints = decoys.map((entry) => positionalLikeness(entry.word, game.password));
        // «4/9» и выше больше не встречается ни при каком первом выборе.
        expect(Math.max(...hints)).toBeLessThanOrEqual(CAP[difficulty]);
        // Подсказки не все одинаковые — иначе мини-игра превращается в угадайку.
        expect(new Set(hints).size).toBeGreaterThanOrEqual(2);
        // Слова похожие: общий набор букв, но расставленный иначе.
        if (difficulty >= 3) {
          expect(Math.min(...decoys.map((entry) => sharedLetters(entry.word, game.password))))
            .toBeGreaterThanOrEqual(3);
        }

        // После ЛЮБОГО первого неверного выбора остаётся несколько кандидатов
        // с такой же подсказкой: «нашёл за вторую попытку» больше не работает.
        for (const guess of decoys) {
          const hint = positionalLikeness(guess.word, game.password);
          const candidates = game.wordRanges.filter((entry) => (
            entry.word !== guess.word && positionalLikeness(guess.word, entry.word) === hint
          ));
          expect(candidates.length).toBeGreaterThanOrEqual(MIN_AMBIGUITY[difficulty]);
        }
      }
    }
  });

  it('сценарий владельца: сложность 5, ИНТ 4, Наука 0 — максимум 2/9 и ≥4 кандидатов', () => {
    const game = gameFor(5, 4, 0, 0.37);
    expect(game.wordLength).toBe(9);
    expect(game.wordCount).toBe(13);
    expect(game.likenessCap).toBe(2);
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
