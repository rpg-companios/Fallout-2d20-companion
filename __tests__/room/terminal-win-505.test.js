// Приёмочный тест 505. Воспроизведение жалобы владельца: Мастер создал
// терминал сложности 3, раздал его, игрок нашёл комбинацию 5/7 и выбрал
// следующее слово. Доска сбросилась и «всё надо заново», Мастер не получил
// уведомлений. Причина: после ACCESS GRANTED окно взлома слало лишний `start`
// (guard пропускал только playing/pendingDigest), а другой clientId (вторая
// вкладка браузера) включал передачу хода из 503 и собирал свежую доску.
// 505 фиксирует победу и добавляет уведомление Мастеру об успехе.
import { describe, expect, it } from 'vitest';
import {
  applyGameAction,
  createGame,
  normalizeTerminalConfig,
  publicGameState,
} from '../../server/terminalHacking.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { shouldAutoStart, autoStartKey, TERMINAL_FINISHED_STATUSES } from '../../components/lootTrade/terminalAutoStart.js';
import { findPending, findCompleted, decisionKey } from '../../components/lootTrade/terminalRetryPrompt.js';
import { ERROR_CODE } from '../../server/protocol.js';

const CONFIG = { containerId: 't1', name: 'Терминал', description: 'Убежище', difficulty: 3 };
const SNAPSHOT = {
  characterName: 'Оператор',
  data: { attributes: { INT: { value: 8 }, LCK: { value: 6 } }, skills: [] },
};

const baseAutoStart = (overrides = {}) => ({
  visible: true,
  autoStart: true,
  hasTerminal: true,
  hasRoom: true,
  characterId: 'c1',
  isClosed: false,
  awaitingGm: false,
  game: null,
  boardOfAnotherOperator: false,
  ...overrides,
});

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm-1' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Второй', role: 'player' });
  for (const [clientId, characterId] of [['p1', 'c1'], ['p2', 'c2']]) {
    registry.putSnapshot({
      code: room.code, characterId, revision: 1, fromClientId: clientId, snapshot: SNAPSHOT,
    });
  }
  registry.issueTerminal({ code: room.code, clientId: 'gm-1', config: CONFIG });
  const hidden = () => registry._rooms.get(room.code).terminalStates.get('t1').game;
  const state = () => registry.getState(room.code).terminalStates.t1;
  const act = (clientId, characterId, action, value) => registry.terminalAction({
    code: room.code, clientId, characterId, containerId: 't1', action, value,
  });
  const win = () => {
    act('p1', 'c1', 'start');
    const passwordRange = hidden().wordRanges.find((range) => range.word === hidden().password);
    return act('p1', 'c1', 'guess', passwordRange.id);
  };
  return { registry, room, hidden, state, act, win };
};

describe('505: автозапуск не стирает победу', () => {
  it('чистое правило: start только на открытие, не после won/awaitingRetry/closed', () => {
    expect(shouldAutoStart(baseAutoStart())).toBe(true);
    expect(shouldAutoStart(baseAutoStart({ autoStart: false }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ visible: false }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ hasTerminal: false }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ hasRoom: false }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ characterId: null }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ isClosed: true }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ awaitingGm: true }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ game: { status: 'playing' } }))).toBe(false);
    expect(shouldAutoStart(baseAutoStart({ game: { status: 'pendingDigest' } }))).toBe(false);
    for (const status of TERMINAL_FINISHED_STATUSES) {
      expect(shouldAutoStart(baseAutoStart({ game: { status } }))).toBe(false);
    }
    // Передача хода по-прежнему работает, но только в активной партии.
    expect(shouldAutoStart(baseAutoStart({
      game: { status: 'playing' }, boardOfAnotherOperator: true,
    }))).toBe(true);
  });

  it('ключ автозапуска различает статусы доски и оператора', () => {
    const common = { roomCode: 'R', containerId: 't1', characterId: 'c1' };
    expect(autoStartKey({ ...common, game: null })).not.toBe(
      autoStartKey({ ...common, game: { status: 'won', operatorCharacterId: 'c1' } }),
    );
    expect(autoStartKey({ ...common, game: { status: 'playing', operatorCharacterId: 'c1' } })).not.toBe(
      autoStartKey({ ...common, game: { status: 'playing', operatorCharacterId: 'c2' } }),
    );
  });

  it('движок: start после ACCESS GRANTED отклоняется у ЛЮБОГО оператора', () => {
    const game = createGame({
      config: normalizeTerminalConfig(CONFIG),
      operatorClientId: 'p1',
      operatorCharacterId: 'c1',
      characterSnapshot: SNAPSHOT,
      now: 1000,
      rng: () => 0.42,
    });
    const passwordRange = game.wordRanges.find((range) => range.word === game.password);
    const won = applyGameAction({
      game,
      config: normalizeTerminalConfig(CONFIG),
      action: 'guess',
      clientId: 'p1',
      characterId: 'c1',
      characterSnapshot: SNAPSHOT,
      value: passwordRange.id,
      now: 1001,
    }).game;
    expect(won.status).toBe('won');
    expect(won.result).toBe('ACCESS GRANTED');

    for (const [clientId, characterId] of [['p1', 'c1'], ['p2', 'c2'], ['p3', 'c1']]) {
      const result = applyGameAction({
        game: won,
        config: normalizeTerminalConfig(CONFIG),
        action: 'start',
        clientId,
        characterId,
        characterSnapshot: SNAPSHOT,
        now: 1002,
        rng: () => 0.13,
      });
      expect(result.error).toBe('TERMINAL_ALREADY_ACTIVE');
      expect(result.game).toBeUndefined();
    }
  });
});

describe('505: сервер хранит победу до явной трансляции Мастера', () => {
  it('угаданный пароль даёт won, а start другой вкладки доску не пересобирает', () => {
    const { hidden, state, act, win } = setup();
    const result = win();
    expect(result.error).toBeUndefined();
    expect(hidden().status).toBe('won');
    expect(hidden().result).toBe('ACCESS GRANTED');
    expect(state().game.status).toBe('won');
    expect(state().awaitingGm).toBe(false);
    // Публичное состояние по-прежнему не выдаёт пароль.
    expect(publicGameState(hidden()).password).toBeUndefined();

    const revision = hidden().revision;
    // Тот же оператор: штатный отказ без пересборки.
    expect(act('p1', 'c1', 'start').error).toBe(ERROR_CODE.TERMINAL_ALREADY_ACTIVE);
    // Другая вкладка / другой персонаж: раньше здесь собиралась новая доска.
    expect(act('p2', 'c2', 'start').error).toBe(ERROR_CODE.TERMINAL_ALREADY_ACTIVE);
    // Чужой персонаж не подменяется: лист c1 опубликован с p1.
    expect(act('p2', 'c1', 'start').error).toBe(ERROR_CODE.SESSION_FORBIDDEN);
    expect(hidden().status).toBe('won');
    expect(hidden().revision).toBe(revision);
    expect(state().game.status).toBe('won');
  });

  it('только reissue Мастера обнуляет доску и разрешает новую партию', () => {
    const { hidden, state, act, win } = setup();
    win();
    const reissued = act('gm-1', null, 'reissue');
    expect(reissued.error).toBeUndefined();
    expect(state().game).toBeNull();
    expect(state().closed).toBe(false);
    const fresh = act('p1', 'c1', 'start');
    expect(fresh.error).toBeUndefined();
    expect(hidden().status).toBe('playing');
    expect(hidden().attempts).toBe(4);
  });

  it('игрок не может обойти победу через guess или bracket', () => {
    const { hidden, act, win } = setup();
    win();
    expect(act('p1', 'c1', 'guess', hidden().wordRanges[0].id).error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
    expect(act('p1', 'c1', 'bracket', hidden().bracketRanges[0]?.id).error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
    expect(hidden().status).toBe('won');
  });
});

describe('505: Мастер узнаёт об успехе', () => {
  const roomWith = (role, terminal) => ({ R: { role, terminalStates: { t1: terminal } } });
  const wonTerminal = {
    closed: false,
    config: { name: 'Терминал', difficulty: 3 },
    game: { status: 'won', revision: 7, operatorName: 'Оператор' },
  };

  it('findCompleted видит won только в комнате Мастера', () => {
    expect(findCompleted(roomWith('gm', wonTerminal))).toEqual([{
      code: 'R',
      containerId: 't1',
      kind: 'won',
      key: `won:${decisionKey('R', 't1', wonTerminal.game)}`,
      name: 'Терминал',
      difficulty: 3,
      operatorName: 'Оператор',
    }]);
    expect(findCompleted(roomWith('player', wonTerminal))).toEqual([]);
    expect(findCompleted(roomWith('gm', { ...wonTerminal, closed: true }))).toEqual([]);
    expect(findCompleted(roomWith('gm', {
      ...wonTerminal, game: { status: 'awaitingRetry', revision: 7 },
    }))).toEqual([]);
  });

  it('успех не порождает вопрос «Разрешить повторный взлом?»', () => {
    expect(findPending(roomWith('gm', wonTerminal))).toEqual([]);
    expect(findCompleted(roomWith('gm', {
      ...wonTerminal, game: { status: 'awaitingRetry', revision: 7 },
    }))).toEqual([]);
  });

  it('ключи вопроса и уведомления не конфликтуют', () => {
    const pending = findPending(roomWith('gm', {
      ...wonTerminal, game: { status: 'awaitingRetry', revision: 7 },
    }))[0];
    const completed = findCompleted(roomWith('gm', {
      ...wonTerminal, game: { status: 'won', revision: 7 },
    }))[0];
    expect(pending.key).not.toBe(completed.key);
  });
});
