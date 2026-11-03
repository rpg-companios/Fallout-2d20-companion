// Приёмочный тест 502: владелец прислал часть реального сейва персонажа
// (файл экспорта «rpg-companion-character») с ИНТ 10, УДЧ 10, Наукой 6 и
// сообщил, что на терминале 5 сложности по-прежнему видит 21 слово.
//
// Патч 501 снимал ровно один конверт `data` (CHAR_PUBLISH). В файле экспорта
// лист лежит глубже — в `character.data`, поэтому ИНТ не находился и снова
// подменялся четвёркой: 25 − 4 = 21. Теперь лист ищется на любой глубине,
// включая строковый JSON и двойные обёртки.
import { describe, expect, it } from 'vitest';
import {
  characterStats,
  createGame,
  normalizeCharacterSnapshot,
  passwordWordCount,
} from '../../server/terminalHacking.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';

// Фрагмент сейва владельца (значения и структура сохранены дословно).
export const exportedCharacter = {
  format: 'rpg-companion-character',
  version: 1,
  exportedAt: '2026-11-02T19:07:58.523Z',
  character: {
    id: 'char_1793455951437_wluz0q9ck',
    name: 'ывывы',
    level: 4,
    originName: 'brotherhood',
    data: {
      characterName: 'ывывы',
      level: 4,
      attributes: [
        { name: 'STR', value: 4 }, { name: 'PER', value: 4 }, { name: 'END', value: 4 },
        { name: 'CHA', value: 4 }, { name: 'INT', value: 10 }, { name: 'AGI', value: 4 },
        { name: 'LCK', value: 10 },
      ],
      skills: [
        { name: 'ATHLETICS', value: 0 }, { name: 'BARTER', value: 0 },
        { name: 'BIG_GUNS', value: 0 }, { name: 'ENERGY_WEAPONS', value: 0 },
        { name: 'EXPLOSIVES', value: 3 }, { name: 'LOCKPICK', value: 3 },
        { name: 'MEDICINE', value: 3 }, { name: 'MELEE_WEAPONS', value: 3 },
        { name: 'PILOT', value: 3 }, { name: 'REPAIR', value: 3 },
        { name: 'SCIENCE', value: 6 }, { name: 'SMALL_GUNS', value: 2 },
        { name: 'SNEAK', value: 2 }, { name: 'SPEECH', value: 2 },
        { name: 'SURVIVAL', value: 0 }, { name: 'THROWING', value: 0 },
        { name: 'UNARMED', value: 0 },
      ],
      selectedSkills: ['SMALL_GUNS', 'SNEAK', 'SPEECH'],
      extraTaggedSkills: ['SCIENCE'],
      forcedSelectedSkills: ['SCIENCE'],
      origin: { id: 'brotherhood' },
      trait: {
        ids: ['brotherhood-chain-that-binds'],
        id: 'brotherhood-chain-that-binds',
        name: 'Цепь, которая связывает',
      },
    },
  },
};

const config = { containerId: 'term-5', name: 'Терминал', difficulty: 5 };
const gameFor = (snapshot) => createGame({
  config,
  operatorClientId: 'player-1',
  operatorCharacterId: 'char-1',
  characterSnapshot: snapshot,
  now: 100,
  rng: () => 0.42,
});

describe('502: файл экспорта персонажа читается на любой глубине', () => {
  it('весь файл экспорта: ИНТ 10, УДЧ 10, Наука 6 → 15 слов и 20 % возврата', () => {
    expect(characterStats(exportedCharacter)).toMatchObject({
      intelligence: 10, luck: 10, science: 6, hackerRank: 0,
    });
    const game = gameFor(exportedCharacter);
    expect(game.wordCount).toBe(15);
    expect(game.wordRanges).toHaveLength(15);
    expect(game.wordCount).toBe(passwordWordCount(5, 10));
    expect(game.recoveryChancePercent).toBe(20);
    expect(game.bracketRanges).toHaveLength(4);
    expect(game.attempts).toBe(4);
    expect(game.operatorName).toBe('ывывы');
  });

  it('все обёртки, которыми сейв может дойти до движка, дают 15 слов', () => {
    const sheet = exportedCharacter.character.data;
    const publish = (data) => ({
      characterId: exportedCharacter.character.id,
      name: 'ывывы',
      level: 4,
      updatedAt: 1,
      data,
    });
    const variants = {
      'сам лист character.data': sheet,
      'CHAR_PUBLISH { data: лист }': publish(sheet),
      'CHAR_PUBLISH { data: файл экспорта }': publish(exportedCharacter),
      'CHAR_PUBLISH { data: JSON-строка файла }': publish(JSON.stringify(exportedCharacter)),
      'только узел character': exportedCharacter.character,
      'JSON-строка всего файла экспорта': JSON.stringify(exportedCharacter),
      'двойная обёртка CHAR_PUBLISH → export': publish(publish(exportedCharacter)),
      'CHAR_PUBLISH { data: { characterData: лист } }': publish({ characterData: sheet }),
    };
    for (const [label, snapshot] of Object.entries(variants)) {
      expect(characterStats(snapshot).intelligence, label).toBe(10);
      expect(characterStats(snapshot).luck, label).toBe(10);
      expect(characterStats(snapshot).science, label).toBe(6);
      expect(gameFor(snapshot).wordCount, label).toBe(15);
    }
  });

  it('через реестр комнаты: опубликованный файл экспорта даёт доску из 15 слов', () => {
    const registry = createRoomRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1' });
    registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'player-1', name: 'ывывы', role: 'player' });
    registry.putSnapshot({
      code: room.code,
      characterId: 'char_1793455951437_wluz0q9ck',
      revision: 1,
      fromClientId: 'player-1',
      snapshot: exportedCharacter,
    });
    expect(registry.issueTerminal({ code: room.code, clientId: 'gm-1', config }).error).toBeUndefined();
    const started = registry.terminalAction({
      code: room.code,
      clientId: 'player-1',
      characterId: 'char_1793455951437_wluz0q9ck',
      containerId: config.containerId,
      action: 'start',
    });
    expect(started.error).toBeUndefined();
    expect(started.terminal.game.intelligence).toBe(10);
    expect(started.terminal.game.luck).toBe(10);
    expect(started.terminal.game.science).toBe(6);
    expect(started.terminal.game.wordCount).toBe(15);
    expect(started.terminal.game.recoveryChancePercent).toBe(20);
    expect(started.terminal.game.operatorName).toBe('ывывы');
  });

  it('служебные поля внешних конвертов не теряются при снятии обёрток', () => {
    const wrapped = {
      characterId: 'c1',
      name: 'ывывы',
      data: {
        ...exportedCharacter,
        terminalHacking: { hasProgrammersDigest: true, digestUsed: false },
        equipment: { items: [{ id: 'mag_programmers_digest' }] },
      },
    };
    const stats = characterStats(wrapped);
    expect(stats.intelligence).toBe(10);
    expect(stats.hasDigest).toBe(true);
    expect(gameFor(wrapped).digestEligible).toBe(true);
    expect(normalizeCharacterSnapshot(wrapped).characterName).toBe('ывывы');
  });

  it('формы из патча 501 и каноническая формула доски не сломаны', () => {
    expect(characterStats({
      attributes: { INT: { value: 10 }, LCK: { value: 4 } },
      skills: [{ id: 'science', rank: 6 }],
      selectedPerks: [{ id: 'hacker', rank: 1 }],
    })).toMatchObject({ intelligence: 10, science: 6, luck: 4, hackerRank: 1 });
    const lowInt = {
      ...exportedCharacter,
      character: {
        ...exportedCharacter.character,
        data: {
          ...exportedCharacter.character.data,
          attributes: exportedCharacter.character.data.attributes.map((attr) => (
            attr.name === 'INT' ? { ...attr, value: 4 } : attr
          )),
        },
      },
    };
    expect(characterStats(lowInt).intelligence).toBe(4);
    expect(gameFor(lowInt).wordCount).toBe(21);
    expect(gameFor(lowInt).wordCount).toBe(passwordWordCount(5, 4));
  });
});
