// Приёмочный тест патча 503. Владелец сообщил о трёх проблемах:
//   1) «Сначала одним персонажем из комнаты пытался взломать (ИНТ 8, Наука 4).
//      Потом подключил другого игрока и попробовал им. Но терминал считал
//      кол-во слов и скобок от старого персонажа, хотя терминал открыл новый».
//      Ответ владельца: «Взламывать терминал одновременно может только 1 игрок.
//      Другие могут только смотреть. При нажатии взлом проверять характеристики
//      игрока, который нажал взлом. Может все 5 человек по очереди захотят
//      попробовать? Каждому свои условия».
//   2) «Полное восстановление попытки должно появиться не более 1 раза на доску».
//   3) «Пусть будет 3 группы слов у которых есть некоторые общие сочетания
//      для группы. Допустим окончания, on/ion, ly/tly, The/tho. Сначала надо
//      будет понять какая группа окончаний верная, потом в этой группе понять
//      например ion или on верная последовательность. Это могут быть не
//      окончания, а приставки или суффиксы».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GROUP_VARIANTS,
  WORD_GROUPS,
  applyGameAction,
  buildGroupedPasswordSet,
  createGame,
  passwordWordCount,
  positionalLikeness,
  publicGameState,
} from '../../server/terminalHacking.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const snapshot = (int = 4, science = 0, luck = 4, name = 'Оператор') => ({
  characterName: name,
  attributes: [{ name: 'INT', value: int }, { name: 'LCK', value: luck }],
  skills: [{ name: 'SCIENCE', value: science }],
});
const gameFor = (int, science, difficulty = 5, luck = 4, seed = 0.42) => createGame({
  config: { containerId: 't', name: 'T', difficulty },
  operatorClientId: 'p', operatorCharacterId: 'c',
  characterSnapshot: snapshot(int, science, luck), now: 100, rng: () => seed,
});

describe('503: три группы с общими сочетаниями', () => {
  it('ровно 3 группы по 2 варианта; все слова реальные; пароль один', () => {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (const int of [4, 10]) {
        const selection = buildGroupedPasswordSet({
          wordLength: difficulty + 4,
          wordCount: passwordWordCount(difficulty, int),
          rng: () => 0.31,
        });
        expect(selection).toBeTruthy();
        expect(selection.groups).toHaveLength(WORD_GROUPS);
        expect(selection.groupVariants).toBe(GROUP_VARIANTS);
        expect(selection.groups.filter((g) => g.winner)).toHaveLength(1);
        expect(new Set(selection.words).size).toBe(selection.wordCount);
        expect(selection.words.filter((w) => w === selection.password)).toHaveLength(1);
        for (const group of selection.groups) {
          expect(group.base.length).toBeGreaterThanOrEqual(2);
          expect(group.variants).toHaveLength(GROUP_VARIANTS);
          // Варианты — разные последовательности с общей основой (например
          // TION/SION при основе ION), а не одно и то же сочетание.
          expect(group.variants[0]).not.toBe(group.variants[1]);
          expect(group.variants.every((v) => v.includes(group.base))).toBe(true);
        }
      }
    }
  });

  it('-gradient: свой вариант > другой вариант своей группы > чужие группы', () => {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (let k = 1; k <= 10; k += 1) {
        const selection = buildGroupedPasswordSet({
          wordLength: difficulty + 4,
          wordCount: passwordWordCount(difficulty, 10),
          rng: () => k / 11,
        });
        const winner = selection.groups.find((g) => g.winner);
        const sibling = winner.variants.find((v) => v !== selection.winnerVariant);
        const belongs = (word, fragment) => (winner.position === 'end'
          ? word.endsWith(fragment) : word.startsWith(fragment));
        const level = (word) => {
          if (belongs(word, selection.winnerVariant)) return 2;
          if (belongs(word, sibling)) return 1;
          return 0;
        };
        const levels = [[], [], []];
        for (const word of selection.words) {
          if (word === selection.password) continue;
          levels[level(word)].push(positionalLikeness(word, selection.password));
        }
        const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : -1);
        expect(mean(levels[2]), `D${difficulty} свой вариант`).toBeGreaterThan(mean(levels[1]));
        expect(mean(levels[1]), `D${difficulty} другой вариант`).toBeGreaterThan(mean(levels[0]));
        // Высокая подсказка допустима: вплоть до L−1 из L.
        expect(selection.likenessCap).toBe(difficulty + 3);
      }
    }
  });

  it('подсказка в окне показывает N из M, а не голое число', () => {
    const modal = read('components/lootTrade/TerminalHackingModal.js');
    expect(modal).toContain('${guess.likeness}/${game?.wordLength');
  });

  it('публичное состояние не выдаёт пароль и состав групп', () => {
    const view = publicGameState(gameFor(10, 6));
    expect(view.password).toBeUndefined();
    expect(view.groups).toBeUndefined();
    expect(view.groupCount).toBe(WORD_GROUPS);
    expect(view.groupVariants).toBe(GROUP_VARIANTS);
    expect(view.wordRanges.every((entry) => !('isPassword' in entry))).toBe(true);
    expect(view.bracketRanges.every((entry) => !('effect' in entry) && !('recovery' in entry))).toBe(true);
  });
});

describe('503: полное восстановление не более 1 раза на доску', () => {
  it('при Удаче 10 и Науке 6 только ОДНА скобка несёт полный возврат', () => {
    expect(GROUP_VARIANTS).toBe(2);
    for (let k = 1; k <= 24; k += 1) {
      const game = gameFor(10, 6, 5, 10, k / 25);
      const full = game.bracketRanges.filter((b) => b.effect.full);
      expect(full.length, `доска ${k}`).toBeLessThanOrEqual(1);
      // Остальные скобки сохраняют свой обычный эффект (скорбка = один эффект).
      for (const bracket of game.bracketRanges) {
        expect(bracket.effect.words + bracket.effect.attempts).toBeLessThanOrEqual(1);
      }
    }
  });

  it('даже если все скобки принудительно «полные», попытки не выше 4 и сброс один', () => {
    const game = gameFor(10, 6, 5, 10);
    const forced = {
      ...game,
      attempts: 1,
      bracketRanges: game.bracketRanges.map((b) => ({
        ...b, effect: { words: 0, attempts: 0, full: true, kind: b.kind }, recovery: true,
      })),
    };
    let next = forced;
    let resets = 0;
    for (const bracket of forced.bracketRanges) {
      const before = next.result;
      next = applyGameAction({
        game: next, action: 'bracket', clientId: 'p', characterId: 'c',
        characterSnapshot: {}, value: bracket.id, now: 101, rng: () => 0,
      }).game;
      if (next.result === 'ATTEMPTS RESET' && before !== 'ATTEMPTS RESET') resets += 1;
      expect(next.attempts).toBeLessThanOrEqual(next.maxAttempts);
    }
    expect(resets).toBe(1);
    expect(next.resetUsed).toBe(true);
    expect(next.attempts).toBeLessThanOrEqual(4);
  });
});

describe('503: смена оператора по нажатию «Взломать»', () => {
  it('доска второго игрока считается по ЕГО ИНТ и Науке; первый становится зрителем', () => {
    const registry = createRoomRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1' });
    registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
    registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Второй', role: 'player' });
    // Точный сценарий владельца: ИНТ 8 / Наука 4 у первого игрока.
    registry.putSnapshot({
      code: room.code, characterId: 'char-1', revision: 1, fromClientId: 'p1',
      snapshot: { name: 'Первый', data: snapshot(8, 4, 4, 'Первый') },
    });
    registry.putSnapshot({
      code: room.code, characterId: 'char-2', revision: 1, fromClientId: 'p2',
      snapshot: { name: 'Второй', data: snapshot(10, 6, 8, 'Второй') },
    });
    const config = { containerId: 'term-5', name: 'Терминал', difficulty: 5 };
    expect(registry.issueTerminal({ code: room.code, clientId: 'gm-1', config }).error).toBeUndefined();

    const first = registry.terminalAction({
      code: room.code, clientId: 'p1', characterId: 'char-1',
      containerId: config.containerId, action: 'start',
    });
    expect(first.error).toBeUndefined();
    const g1 = first.terminal.game;
    expect(g1.intelligence).toBe(8);
    expect(g1.science).toBe(4);
    expect(g1.wordCount).toBe(passwordWordCount(5, 8)); // 17 слов
    expect(g1.bracketRanges).toHaveLength(3);           // Наука 4

    // Первый игрок ещё не закончил — второй нажимает «Взломать».
    const second = registry.terminalAction({
      code: room.code, clientId: 'p2', characterId: 'char-2',
      containerId: config.containerId, action: 'start',
    });
    expect(second.error).toBeUndefined();
    const g2 = second.terminal.game;
    expect(g2.operatorClientId).toBe('p2');
    expect(g2.operatorCharacterId).toBe('char-2');
    expect(g2.operatorName).toBe('Второй');
    expect(g2.intelligence).toBe(10);
    expect(g2.science).toBe(6);
    expect(g2.luck).toBe(8);
    expect(g2.wordCount).toBe(passwordWordCount(5, 10)); // 15 слов, а не 17
    expect(g2.bracketRanges).toHaveLength(4);            // Наука 6, а не 3
    expect(g2.attempts).toBe(4);                         // новая партия
    expect(g2.guesses).toHaveLength(0);
    expect(g2.groupCount).toBe(WORD_GROUPS);

    // Повторный start от того же оператора не сбрасывает прогресс.
    const repeat = registry.terminalAction({
      code: room.code, clientId: 'p2', characterId: 'char-2',
      containerId: config.containerId, action: 'start',
    });
    expect(repeat.error).toBe('TERMINAL_ALREADY_ACTIVE');

    // Первый игрок теперь только наблюдает: его ход отклоняется.
    const spectator = registry.terminalAction({
      code: room.code, clientId: 'p1', characterId: 'char-1',
      containerId: config.containerId, action: 'guess', value: g2.wordRanges[0].id,
    });
    expect(spectator.error).toBe('TERMINAL_VIEW_ONLY');

    // Пятый игрок тоже может попробовать в свою очередь — со своими условиями.
    registry.joinRoom({ code: room.code, clientId: 'p5', name: 'Пятый', role: 'player' });
    registry.putSnapshot({
      code: room.code, characterId: 'char-5', revision: 1, fromClientId: 'p5',
      snapshot: { name: 'Пятый', data: snapshot(4, 0, 4, 'Пятый') },
    });
    const fifth = registry.terminalAction({
      code: room.code, clientId: 'p5', characterId: 'char-5',
      containerId: config.containerId, action: 'start',
    });
    expect(fifth.error).toBeUndefined();
    expect(fifth.terminal.game.wordCount).toBe(passwordWordCount(5, 4)); // 21 слово
    expect(fifth.terminal.game.bracketRanges).toHaveLength(0);
    expect(fifth.terminal.game.operatorName).toBe('Пятый');
  });
});
