// Приёмочный тест 501: «Почему при ИНТ 10 я вижу 21 слово на терминале
// 5 сложности? Если 25−10 = 15?».
//
// Причина была не в формуле, а в чтении листа персонажа. Сетевой конверт
// CHAR_PUBLISH кладёт сохранение персонажа в поле `data`, а сохранение
// хранит атрибуты и навыки legacy-массивами `[{ name: 'INT', value: 10 }]`.
// Движок умел читать только словарь `{ INT: { value } }` и массив с полями
// `id`/`key`, поэтому ИНТ и УДЧ не находились и молча падали на 4:
// 25 − 4 = 21. Наука читалась по полю `name`, поэтому 4 скобки при Науке 6
// выглядели правильно и маскировали ошибку.
import { describe, expect, it } from 'vitest';
import {
  characterStats,
  createGame,
  normalizeCharacterSnapshot,
  passwordWordCount,
} from '../../server/terminalHacking.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  applyLocalTerminalAction,
  buildLocalCharacterSnapshot,
  initialLocalTerminalState,
} from '../../components/lootTrade/localTerminalGame.js';

// Ровно тот формат, который buildLocalCharacterRoomSnapshot()/public/CHAR_PUBLISH
// отправляет в комнату: обёртка персонажа + legacy-лист внутри `data`.
const publishedSnapshot = (overrides = {}) => ({
  characterId: 'char-1',
  name: 'Оператор',
  level: 7,
  originName: 'vault_dweller',
  updatedAt: 1000,
  avatarDataUrl: null,
  data: {
    characterName: 'Оператор',
    level: 7,
    attributes: [
      { name: 'STR', value: 4 }, { name: 'PER', value: 6 }, { name: 'END', value: 5 },
      { name: 'CHA', value: 4 }, { name: 'INT', value: 10 }, { name: 'AGI', value: 7 },
      { name: 'LCK', value: 8 },
    ],
    skills: [
      { name: 'SCIENCE', value: 6 }, { name: 'REPAIR', value: 3 },
      { name: 'LOCKPICK', value: 0 },
    ],
    selectedPerks: [],
    usedMagazineEffects: [],
    equipment: { items: [] },
    terminalHacking: { hasProgrammersDigest: false, digestUsed: false },
    ...overrides,
  },
});

const config = { containerId: 'term-5', name: 'Сетевой терминал', difficulty: 5 };
const noRandomness = () => 0.42;
const gameFor = (snapshot, difficulty = 5) => createGame({
  config: { ...config, difficulty },
  operatorClientId: 'player-1',
  operatorCharacterId: 'char-1',
  characterSnapshot: snapshot,
  now: 100,
  rng: noRandomness,
});

describe('501: лист персонажа читается из сетевого снапшота, а не подменяется четвёркой', () => {
  it('снимает конверт CHAR_PUBLISH и читает ИНТ 10, Науку 6, УДЧ 8', () => {
    expect(normalizeCharacterSnapshot(publishedSnapshot()).attributes[4]).toEqual({ name: 'INT', value: 10 });
    expect(characterStats(publishedSnapshot())).toMatchObject({
      intelligence: 10,
      science: 6,
      luck: 8,
      hackerRank: 0,
    });
  });

  it('на сложности 5 при ИНТ 10 доска — 15 слов, а не 21', () => {
    const game = gameFor(publishedSnapshot());
    expect(game.intelligence).toBe(10);
    expect(game.wordCount).toBe(15);
    expect(game.wordRanges).toHaveLength(15);
    expect(game.wordCount).toBe(passwordWordCount(5, 10));
    expect(game.bracketRanges).toHaveLength(4);
    expect(game.recoveryChancePercent).toBe(15);
    expect(game.attempts).toBe(4);
  });

  it('сохраняет каноническую формулу: ИНТ 4 на сложности 5 даёт 21 слово', () => {
    const snapshot = publishedSnapshot();
    snapshot.data.attributes = snapshot.data.attributes.map((attr) => (
      attr.name === 'INT' ? { ...attr, value: 4 } : attr
    ));
    const game = gameFor(snapshot);
    expect(game.intelligence).toBe(4);
    expect(game.wordCount).toBe(21);
    expect(game.wordCount).toBe(passwordWordCount(5, 4));
  });

  it('через реестр комнаты: опубликованный персонаж запускает доску из 15 слов', () => {
    const registry = createRoomRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1' });
    registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'player-1', name: 'Оператор', role: 'player' });
    registry.putSnapshot({
      code: room.code,
      characterId: 'char-1',
      revision: 1,
      fromClientId: 'player-1',
      snapshot: publishedSnapshot(),
    });
    expect(registry.issueTerminal({ code: room.code, clientId: 'gm-1', config }).error).toBeUndefined();
    const started = registry.terminalAction({
      code: room.code, clientId: 'player-1', characterId: 'char-1',
      containerId: config.containerId, action: 'start',
    });
    expect(started.error).toBeUndefined();
    expect(started.terminal.game.intelligence).toBe(10);
    expect(started.terminal.game.science).toBe(6);
    expect(started.terminal.game.luck).toBe(8);
    expect(started.terminal.game.wordCount).toBe(15);
    expect(started.terminal.game.wordRanges).toHaveLength(15);
    expect(started.terminal.game.operatorName).toBe('Оператор');
    expect(started.terminal.game.password).toBeUndefined();
  });

  it('перк «Хакер» из сохранения [{ perkId, index }] снижает сложность 5 → 4', () => {
    const snapshot = publishedSnapshot({ selectedPerks: [{ perkId: 'hacker', index: 0 }] });
    const game = gameFor(snapshot);
    expect(characterStats(snapshot).hackerRank).toBe(1);
    expect(game.effectiveDifficulty).toBe(4);
    expect(game.wordLength).toBe(8);
    expect(game.wordCount).toBe(passwordWordCount(4, 10));
  });

  it('Programmer’s Digest находится в equipment.items опубликованного листа', () => {
    const snapshot = publishedSnapshot({
      equipment: { items: [{ id: 'mag_programmers_digest', itemId: 'mag_programmers_digest' }] },
      terminalHacking: { hasProgrammersDigest: true, digestUsed: false },
    });
    expect(characterStats(snapshot).hasDigest).toBe(true);
    expect(gameFor(snapshot).digestEligible).toBe(true);
  });

  it('понимает и строковый data, и legacy-массив без обёртки, и живой стор', () => {
    const data = publishedSnapshot().data;
    expect(characterStats({ data: JSON.stringify(data) }).intelligence).toBe(10);
    expect(characterStats(data).intelligence).toBe(10);
    // Нормализованный стор приложения: словарь { INT: { base, total } }.
    expect(characterStats({
      attributes: { INT: { base: 10, total: 10 }, LCK: { base: 9, total: 9 } },
      skills: { SCIENCE: { base: 5, total: 5 } },
      selectedPerks: [{ perkId: 'hacker', index: 0 }],
    })).toMatchObject({ intelligence: 10, science: 5, luck: 9, hackerRank: 1 });
    // Прежний формат тестов движка остаётся рабочим.
    expect(characterStats({
      attributes: { INT: { value: 10 }, LCK: { value: 4 } },
      skills: [{ id: 'science', rank: 6 }],
      selectedPerks: [{ id: 'hacker', rank: 1 }],
    })).toMatchObject({ intelligence: 10, science: 6, luck: 4, hackerRank: 1 });
    // Навыки/атрибуты в нижнем регистре и русские названия тоже читаются.
    expect(characterStats({ attributes: [{ name: 'int', value: 9 }], skills: [{ name: 'наука', value: 3 }] }))
      .toMatchObject({ intelligence: 9, science: 3 });
  });

  it('локальный резерв мини-игры тоже собирает 15 слов из состояния стора', () => {
    const state = buildLocalCharacterSnapshot({
      characterName: 'Оператор',
      attributes: { INT: { base: 10, total: 10 }, LCK: { base: 8, total: 8 } },
      skills: { SCIENCE: { base: 6, total: 6 } },
      selectedPerks: [],
      items: {},
    });
    const started = applyLocalTerminalAction(initialLocalTerminalState(), 'start', undefined, {
      terminal: config,
      characterId: 'char-1',
      characterSnapshot: state,
      now: 100,
      rng: noRandomness,
    });
    expect(started.error).toBeNull();
    expect(started.game.intelligence).toBe(10);
    expect(started.game.wordCount).toBe(15);
    expect(started.view.wordRanges).toHaveLength(15);
  });
});
