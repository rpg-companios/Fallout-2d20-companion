// Приёмочный тест патча 504. Владелец заменил галочку «блокировать после
// провала» на решение Мастера:
//   «вместо "блокировать после провала" переходим на модель: мастеру всплывает
//    сообщение "Разрешить повторный взлом? Да/нет". Если да - новый конфиг.
//    Нет, терминал нельзя больше взломать или посмотреть, если мастер не
//    транслирует его снова».
// Уточнения владельца: вопрос только при провале (не после успеха); «Да» сразу
// строит новую доску по ТЕКУЩИМ настройкам; «Нет» оставляет карточку с
// отметкой «Закрыт» и запрещает обе кнопки до новой трансляции; поле
// lockOnFailure удаляется из формы, движка и сохранений полностью.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGameAction,
  createGame,
  decodeTerminalNodeMarker,
  encodeTerminalNodeMarker,
  normalizeTerminalConfig,
  publicGameState,
  syncGameConfig,
} from '../../server/terminalHacking.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  encodeTerminalNodeMarker as domainEncodeMarker,
  normalizeContainerEntity,
} from '../../domain/lootTrade.js';
import { normalizeActiveSession, applySessionUpdate } from '../../server/lootTradeSession.js';
import { applyLocalTerminalAction, initialLocalTerminalState } from '../../components/lootTrade/localTerminalGame.js';
import { findPending } from '../../components/lootTrade/terminalRetryPrompt.js';
import { ERROR_CODE } from '../../server/protocol.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const SNAPSHOT = {
  characterName: 'Оператор',
  data: { attributes: { INT: { value: 4 }, LCK: { value: 4 } }, skills: [] },
};
const BASE_CONFIG = { containerId: 't1', name: 'Терминал', description: 'Убежище', difficulty: 5 };

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm-1' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Второй', role: 'player' });
  for (const [clientId, characterId] of [['p1', 'c1'], ['p2', 'c2']]) {
    registry.putSnapshot({
      code: room.code,
      characterId,
      revision: 1,
      fromClientId: clientId,
      snapshot: SNAPSHOT,
    });
  }
  registry.issueTerminal({ code: room.code, clientId: 'gm-1', config: BASE_CONFIG });
  const state = () => registry.getState(room.code).terminalStates.t1;
  const hidden = () => registry._rooms.get(room.code).terminalStates.get('t1').game;
  const act = (clientId, characterId, action, value) => registry.terminalAction({
    code: room.code, clientId, characterId, containerId: 't1', action, value,
  });
  const start = (clientId = 'p1', characterId = 'c1') => act(clientId, characterId, 'start');
  const exhaust = (clientId = 'p1', characterId = 'c1') => {
    const game = hidden();
    const wrong = game.wordRanges.filter((range) => range.word !== game.password).slice(0, 4);
    let last = null;
    for (const range of wrong) last = act(clientId, characterId, 'guess', range.id);
    return last;
  };
  return { registry, room, state, hidden, act, start, exhaust };
};

describe('504: провал виден и ждёт решения Мастера', () => {
  it('после четырех ошибок — awaitingRetry с явным результатом, без автоблокировки', () => {
    const { state, start, exhaust } = setup();
    start();
    const result = exhaust();
    expect(result.error).toBeUndefined();
    expect(state().game.status).toBe('awaitingRetry');
    expect(state().game.result).toBe('ATTEMPTS EXHAUSTED');
    expect(state().game.attempts).toBe(0);
    expect(state().awaitingGm).toBe(true);
    expect(state().closed).toBe(false);
    expect(state().locked).toBe(false);
    // Публичное состояние не выдаёт пароль, но показывает провал.
    expect(publicGameState(state().game).password).toBeUndefined();
    expect(publicGameState(state().game).result).toBe('ATTEMPTS EXHAUSTED');
  });

  it('после провала нельзя ни взломать заново, ни тронуть доску без ответа Мастера', () => {
    const { act, start, exhaust } = setup();
    start();
    exhaust();
    for (const action of ['start', 'guess', 'bracket', 'view', 'useDigest']) {
      expect(act('p1', 'c1', action).error).toBe(ERROR_CODE.TERMINAL_AWAITING_RETRY);
    }
    // «Да/Нет» — исключительно действие Мастера.
    expect(act('p1', 'c1', 'retry', 'yes').error).toBe(ERROR_CODE.TERMINAL_GM_ONLY);
  });

  it('после успеха вопрос не всплывает', () => {
    const { registry, room, state, start, hidden, act } = setup();
    start();
    const password = hidden().password;
    const won = act('p1', 'c1', 'guess', hidden().wordRanges.find((r) => r.word === password).id);
    expect(won.terminal.game.status).toBe('won');
    expect(won.terminal.awaitingGm).toBe(false);
    expect(registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'yes',
    }).error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
    expect(state().game.result).toBe('ACCESS GRANTED');
  });

  it('отказ от «Дайджеста программиста» тоже приводит к вопросу Мастеру', () => {
    const { state, act, start, exhaust } = setup();
    start();
    const withDigest = { ...SNAPSHOT, data: { ...SNAPSHOT.data, terminalHacking: { hasProgrammersDigest: true } } };
    // Переиздаём доску под лист с журналом.
    const { registry, room } = setup();
    registry.putSnapshot({
      code: room.code, characterId: 'c1', revision: 2, fromClientId: 'p1', snapshot: withDigest,
    });
    registry.terminalAction({ code: room.code, clientId: 'p1', characterId: 'c1', containerId: 't1', action: 'start' });
    const hiddenGame = registry._rooms.get(room.code).terminalStates.get('t1').game;
    const wrong = hiddenGame.wordRanges.filter((r) => r.word !== hiddenGame.password).slice(0, 4);
    for (const range of wrong) {
      registry.terminalAction({ code: room.code, clientId: 'p1', characterId: 'c1', containerId: 't1', action: 'guess', value: range.id });
    }
    expect(registry.getState(room.code).terminalStates.t1.game.status).toBe('pendingDigest');
    const declined = registry.terminalAction({ code: room.code, clientId: 'p1', characterId: 'c1', containerId: 't1', action: 'declineDigest' });
    expect(declined.terminal.game.status).toBe('awaitingRetry');
    expect(declined.terminal.awaitingGm).toBe(true);
    // Неиспользуемые here переменные нужны только для читаемости сценария.
    expect(state().game.status).toBe('playing');
    expect(typeof act).toBe('function');
    expect(typeof exhaust).toBe('function');
  });
});

describe('504: «Да» — новая доска по текущим настройкам', () => {
  it('сразу строит свежую доску: новые слова, 4 попытки, имя и сложность из текущей карточки', () => {
    const { registry, room, state, start, exhaust, hidden } = setup();
    start();
    const oldWords = hidden().wordRanges.map((range) => range.word);
    exhaust();
    const failedRevision = state().game.revision;
    expect(failedRevision).toBeGreaterThan(1);
    // Мастер меняет настройки ПОСЛЕ провала, пока ждёт решения.
    registry.issueTerminal({
      code: room.code, clientId: 'gm-1',
      config: { ...BASE_CONFIG, name: 'Перепрошитый', description: 'Новый блок', difficulty: 1 },
    });
    // Запрос к Мастеру не потерялся из-за правки карточки.
    expect(state().awaitingGm).toBe(true);
    const yes = registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'yes',
    });
    expect(yes.error).toBeUndefined();
    expect(yes.terminal.awaitingGm).toBe(false);
    expect(yes.terminal.closed).toBe(false);
    expect(yes.terminal.game.status).toBe('playing');
    expect(yes.terminal.game.attempts).toBe(4);
    expect(yes.terminal.game.maxAttempts).toBe(4);
    expect(yes.terminal.game.difficulty).toBe(1);
    expect(yes.terminal.game.wordLength).toBe(5);
    expect(yes.terminal.game.name).toBe('Перепрошитый');
    expect(yes.terminal.game.description).toBe('Новый блок');
    // Новая партия начинает счётчик ревизий заново: это действительно свежая
    // доска, а не продолжение проваленной.
    expect(yes.terminal.game.revision).toBe(1);
    expect(hidden().operatorName).toBe('Оператор');
    // Новая доска — новые слова, а не старый набор из проваленной партии.
    expect(hidden().wordRanges.map((range) => range.word)).not.toEqual(oldWords);
    expect(hidden().guesses).toHaveLength(0);
    expect(hidden().wordRanges.every((range) => !range.removed && !range.guessed)).toBe(true);
    expect(hidden().bracketRanges.every((range) => !range.used)).toBe(true);
  });

  it('настройки, изменённые ВО ВРЕМЯ доступа, влияют на «Да», но не стирают активную доску', () => {
    const { registry, room, state, start, exhaust } = setup();
    start();
    registry.issueTerminal({
      code: room.code, clientId: 'gm-1', config: { ...BASE_CONFIG, difficulty: 2 },
    });
    // Прогресс партии сохранён, а конфигурация карточки уже свежая.
    expect(state().game.status).toBe('playing');
    expect(state().config.difficulty).toBe(2);
    exhaust();
    const yes = registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'yes',
    });
    expect(yes.terminal.game.difficulty).toBe(2);
    expect(yes.terminal.game.wordLength).toBe(6);
  });

  it('«Да» сохраняет лист оператора: ИНТ10 даёт 15 слов, а не дефолтные 21', () => {
    const registry = createRoomRegistry({ now: () => 1000 });
    const { room } = registry.createRoom({ clientId: 'gm-1' });
    registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Умный', role: 'player' });
    registry.putSnapshot({
      code: room.code, characterId: 'c1', revision: 1, fromClientId: 'p1',
      snapshot: { characterName: 'Умный', data: { attributes: { INT: { value: 10 } }, skills: [{ name: 'SCIENCE', value: 6 }] } },
    });
    registry.issueTerminal({ code: room.code, clientId: 'gm-1', config: BASE_CONFIG });
    registry.terminalAction({ code: room.code, clientId: 'p1', characterId: 'c1', containerId: 't1', action: 'start' });
    const hidden = registry._rooms.get(room.code).terminalStates.get('t1').game;
    expect(hidden.wordCount).toBe(15);
    const wrong = hidden.wordRanges.filter((r) => r.word !== hidden.password).slice(0, 4);
    for (const range of wrong) {
      registry.terminalAction({ code: room.code, clientId: 'p1', characterId: 'c1', containerId: 't1', action: 'guess', value: range.id });
    }
    const yes = registry.terminalAction({ code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'yes' });
    expect(yes.terminal.game.wordCount).toBe(15);
    expect(yes.terminal.game.bracketRanges).toHaveLength(4);
  });

  it('«Взломать» тоже собирает доску по свежему конфигу, а не по полям старой партии', () => {
    const game = createGame({
      config: BASE_CONFIG, operatorClientId: 'p1', operatorCharacterId: 'c1',
      characterSnapshot: SNAPSHOT, now: 100, rng: () => 0.42,
    });
    const fresh = applyGameAction({
      game, config: { ...BASE_CONFIG, difficulty: 1, name: 'Свежий' },
      action: 'start', clientId: 'p2', characterId: 'c2',
      characterSnapshot: SNAPSHOT, now: 200, rng: () => 0.42,
    }).game;
    expect(fresh.difficulty).toBe(1);
    expect(fresh.wordLength).toBe(5);
    expect(fresh.name).toBe('Свежий');
    expect(fresh.operatorCharacterId).toBe('c2');
  });

  it('syncGameConfig обновляет «живые» поля, но не меняет сложность собранной доски', () => {
    const game = createGame({
      config: BASE_CONFIG, operatorClientId: 'p1', operatorCharacterId: 'c1',
      characterSnapshot: SNAPSHOT, now: 100, rng: () => 0.42,
    });
    const next = syncGameConfig(game, { ...BASE_CONFIG, name: 'Новое имя', difficulty: 1 });
    expect(next.name).toBe('Новое имя');
    expect(next.difficulty).toBe(5);
    expect(next.wordLength).toBe(9);
    expect(syncGameConfig(game, game)).toBe(game);
  });
});

describe('504: «Нет» — карточка «Закрыт» до новой трансляции', () => {
  it('обе кнопки запрещены; повторная трансляция Мастера снова открывает терминал', () => {
    const { registry, room, state, act, start, exhaust } = setup();
    start();
    exhaust();
    const no = registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'no',
    });
    expect(no.error).toBeUndefined();
    expect(state().closed).toBe(true);
    expect(state().locked).toBe(true);
    expect(state().awaitingGm).toBe(false);
    expect(state().game.status).toBe('closed');
    expect(state().game.result).toBe('TERMINAL CLOSED');
    for (const action of ['start', 'guess', 'bracket', 'view']) {
      expect(act('p1', 'c1', action).error).toBe(ERROR_CODE.TERMINAL_CLOSED);
    }
    expect(act('p2', 'c2', 'start').error).toBe(ERROR_CODE.TERMINAL_CLOSED);
    // Правка настроек сама по себе НЕ снимает «Закрыт».
    registry.issueTerminal({
      code: room.code, clientId: 'gm-1', config: { ...BASE_CONFIG, difficulty: 2 },
    });
    expect(state().closed).toBe(true);
    // Явная повторная трансляция — снимает.
    const reissued = registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'reissue',
    });
    expect(reissued.terminal.closed).toBe(false);
    expect(reissued.terminal.game).toBeNull();
    expect(act('p1', 'c1', 'start').terminal.game.difficulty).toBe(2);
  });

  it('issueTerminal с reissue и новая выдача локации снимают «Закрыт»; правка узла — нет', () => {
    const { registry, room, state, start, exhaust } = setup();
    start();
    exhaust();
    registry.terminalAction({ code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'no' });
    expect(state().closed).toBe(true);
    // Повторная выдача локации = новая трансляция.
    registry.openSession({
      code: room.code, clientId: 'gm-1',
      session: {
        containerId: 'hub', kind: 'hub', name: 'Убежище', targetType: 'room',
        nodes: [{ containerId: 't1', kind: 'terminal', name: 'Терминал', difficulty: 3, items: [] }],
      },
    });
    expect(state().closed).toBe(false);
    expect(state().config.difficulty).toBe(3);
    // Правка того же узла не переоткрывает закрытый вручную терминал.
    registry.terminalAction({ code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'no' }).error;
    const fresh = setup();
    fresh.start();
    fresh.exhaust();
    fresh.registry.terminalAction({ code: fresh.room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'no' });
    fresh.registry.updateSession({
      code: fresh.room.code, clientId: 'gm-1',
      payload: { nodeContainerId: 't1', nodeDifficulty: 4 },
    });
    // Узел отсутствует в hub-сессии — состояние закрытия не тронуто.
    expect(fresh.state().closed).toBe(true);
    const direct = fresh.registry.issueTerminal({
      code: fresh.room.code, clientId: 'gm-1', reissue: true, config: BASE_CONFIG,
    });
    expect(direct.terminal.closed).toBe(false);
  });

  it('«Да» после закрытия не обходит отказ: решение принимается только в awaitingRetry', () => {
    const { registry, room, state, start, exhaust } = setup();
    start();
    exhaust();
    registry.terminalAction({ code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'no' });
    expect(registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'yes',
    }).error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
    expect(state().closed).toBe(true);
    expect(registry.terminalAction({
      code: room.code, clientId: 'gm-1', containerId: 't1', action: 'retry', value: 'maybe',
    }).error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
  });
});

describe('504: lockOnFailure удалён полностью', () => {
  it('движок не читает и не пишет поле; старые сохранения с ним игнорируются', () => {
    const config = normalizeTerminalConfig({ ...BASE_CONFIG, lockOnFailure: true });
    expect(config).not.toHaveProperty('lockOnFailure');
    // Патч 516: конфигурация терминала несёт ещё и требование ключа.
    expect(Object.keys(config).sort()).toEqual([
      'containerId', 'description', 'difficulty', 'keyRequirement',
      'linkedCheckId', 'name', 'requiredKeyItemId',
    ]);
    const game = createGame({
      config, operatorClientId: 'p', operatorCharacterId: 'c',
      characterSnapshot: SNAPSHOT, now: 100, rng: () => 0.42,
    });
    expect(game).not.toHaveProperty('lockOnFailure');
    expect(publicGameState(game)).not.toHaveProperty('lockOnFailure');
  });

  it('маркер узла больше не содержит f, но понимает старые маркеры', () => {
    const legacy = `F2D20-TERM:${JSON.stringify({ v: 1, d: 4, f: 1, l: 'Замок' })}`;
    expect(decodeTerminalNodeMarker(legacy)).toEqual({ difficulty: 4, label: 'Замок' });
    const written = encodeTerminalNodeMarker({ difficulty: 4, label: 'Замок' });
    expect(written).not.toContain('"f"');
    expect(written).toBe(domainEncodeMarker({ difficulty: 4, label: 'Замок' }));
    expect(decodeTerminalNodeMarker(written)).toEqual({ difficulty: 4, label: 'Замок' });
  });

  it('карточка, узлыhub и сессия не сохраняют поле даже если оно пришло извне', () => {
    const container = normalizeContainerEntity({ id: 't1', kind: 'terminal', name: 'T', difficulty: 3, lockOnFailure: true });
    expect(container).not.toHaveProperty('lockOnFailure');
    const session = normalizeActiveSession({
      kind: 'hub', name: 'Убежище', targetType: 'room',
      nodes: [{ containerId: 't1', kind: 'terminal', name: 'T', difficulty: 3, lockOnFailure: true, items: [] }],
    }, 1000);
    expect(session.nodes[0]).not.toHaveProperty('lockOnFailure');
    const updated = applySessionUpdate(session, {
      sessionId: session.sessionId, nodeContainerId: 't1', nodeDifficulty: 5, nodeLockOnFailure: false,
    }, 2000);
    expect(updated.session.nodes[0]).not.toHaveProperty('lockOnFailure');
    expect(updated.session.nodes[0].difficulty).toBe(5);
    expect(decodeTerminalNodeMarker(updated.session.nodes[0].lockLabel)).toEqual({ difficulty: 5, label: '' });
  });

  it('в исходниках формы, движка, реестра и клиента нет галочки', () => {
    for (const file of [
      'server/terminalHacking.js',
      'server/roomRegistry.js',
      'server/lootTradeSession.js',
      'domain/lootTrade.js',
      'components/screens/LootTradeScreen/modals/ContainerFormModal.js',
      'components/screens/LootTradeScreen/LootTradeScreen.js',
      'components/lootTrade/localTerminalGame.js',
      'components/lootTrade/TerminalHackingModal.js',
      'components/lootTrade/PlayerLootTradeOverlay.js',
      'src/room/roomStore.ts',
    ]) {
      expect(read(file), file).not.toContain('lockOnFailure');
      expect(read(file), file).not.toContain('nodeLockOnFailure');
    }
    expect(read('components/screens/LootTradeScreen/modals/ContainerFormModal.js')).not.toContain('terminalLockLabel');
    expect(read('App.js')).toContain('<TerminalRetryPromptHost />');
    for (const dict of [
      'i18n/ru-RU/screens/lootTrade/screen.json',
      'i18n/en-EN/screens/lootTrade/screen.json',
    ]) {
      expect(json(dict).form.terminalLockLabel).toBeUndefined();
      expect(json(dict).terminal.terminalLockedHint).toBeUndefined();
    }
  });

  it('коды ошибок новой модели есть и на сервере, и в клиенте', () => {
    expect(ERROR_CODE.TERMINAL_CLOSED).toBe('TERMINAL_CLOSED');
    expect(ERROR_CODE.TERMINAL_AWAITING_RETRY).toBe('TERMINAL_AWAITING_RETRY');
    const clientProtocol = read('src/room/roomProtocol.ts');
    expect(clientProtocol).toContain("TERMINAL_CLOSED: 'TERMINAL_CLOSED'");
    expect(clientProtocol).toContain("TERMINAL_AWAITING_RETRY: 'TERMINAL_AWAITING_RETRY'");
  });
});

describe('504: диалог Мастера и экраны', () => {
  it('findPending видит только провалы в комнатах Мастера и только один раз на ревизию', () => {
    const rooms = {
      'GM-1': {
        role: 'gm',
        terminalStates: {
          a: { closed: false, config: { name: 'A', difficulty: 3 }, game: { status: 'awaitingRetry', revision: 7 } },
          b: { closed: false, config: { name: 'B', difficulty: 2 }, game: { status: 'won', revision: 8 } },
          c: { closed: true, config: { name: 'C', difficulty: 1 }, game: { status: 'awaitingRetry', revision: 9 } },
        },
      },
      'GM-2': { role: 'player', terminalStates: { d: { game: { status: 'awaitingRetry', revision: 3 } } } },
    };
    expect(findPending(rooms)).toEqual([{
      code: 'GM-1', containerId: 'a', key: 'GM-1|a|7', name: 'A', difficulty: 3,
    }]);
  });

  it('в словарях есть вопрос, Да/Нет, бейдж «Закрыт» и повторная трансляция', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').terminal;
    const en = json('i18n/en-EN/screens/lootTrade/screen.json').terminal;
    expect(ru.retryTitle).toBe('Разрешить повторный взлом?');
    expect(ru.retryYes).toBe('Да');
    expect(ru.retryNo).toBe('Нет');
    expect(ru.closedBadge).toBe('ЗАКРЫТ');
    expect(en.retryTitle).toBe('Allow another hack?');
    expect(en.retryYes).toBe('Yes');
    expect(en.retryNo).toBe('No');
    expect(en.closedBadge).toBe('CLOSED');
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    for (const key of ['retryMessage', 'retryWaiting', 'retryWaitingHint', 'closedHint', 'reissue', 'hackFailed', 'attemptsExhausted', 'stateReady', 'stateAwaiting', 'stateClosed', 'retryFailed']) {
      expect(ru[key], key).toBeTruthy();
      expect(en[key], key).toBeTruthy();
    }
  });

  it('оверлей игрока показывает «Закрыт» и отключает обе кнопки; модалка сообщает о провале', () => {
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).toContain('terminal-closed-badge');
    // Патч 506: обе кнопки блокируются единым признаком завершённого
    // доступа (закрыт / ждёт решения / взломан / билет уже использован).
    expect(overlay).toContain('disabled={Boolean(accessBlockedReason)}');
    expect(overlay).toContain('disabled={!hackAllowed}');
    expect(overlay).toContain('terminalClosedBadge');
    expect(overlay).toContain('terminalAwaiting');
    const modal = read('components/lootTrade/TerminalHackingModal.js');
    expect(modal).toContain("game?.status === 'awaitingRetry'");
    expect(modal).toContain("tLootTrade('terminal.hackFailed')");
    expect(modal).toContain("tLootTrade('terminal.retryWaiting')");
    expect(modal).toContain('const canHack = Boolean(characterId');
    expect(modal).toContain('!isClosed && !awaitingGm');
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).toContain("action: 'retry'");
    expect(screen).toContain("action: 'reissue'");
    expect(screen).toContain('reissue: true');
    expect(screen).not.toContain('terminalLockLabel');
  });
});

describe('504: локальный резерв без сервера повторяет ту же модель', () => {
  const ctx = (difficulty = 5, name = 'Терминал') => ({
    terminal: { containerId: 't1', name, difficulty },
    characterId: 'c1',
    characterSnapshot: { characterName: 'Оператор', attributes: { INT: { value: 4 } }, skills: [] },
    now: 100,
    rng: () => 0.42,
  });

  const play = () => {
    let state = applyLocalTerminalAction(initialLocalTerminalState(), 'start', undefined, ctx());
    const wrong = state.game.wordRanges.filter((range) => range.word !== state.game.password).slice(0, 4);
    for (const range of wrong) {
      state = applyLocalTerminalAction(state, 'guess', range.id, ctx());
    }
    return state;
  };

  it('провал → awaitingRetry, повторный start запрещён без решения Мастера', () => {
    const failed = play();
    expect(failed.view.status).toBe('awaitingRetry');
    expect(failed.view.result).toBe('ATTEMPTS EXHAUSTED');
    const again = applyLocalTerminalAction(failed, 'start', undefined, ctx());
    expect(again.error).toBe('TERMINAL_AWAITING_RETRY');
    expect(again.view.status).toBe('awaitingRetry');
  });

  it('«Да» строит новую доску по свежим настройкам, «Нет» закрывает терминал', () => {
    const failed = play();
    const yes = applyLocalTerminalAction(failed, 'retryYes', undefined, ctx(1, 'Прошитый'));
    expect(yes.view.status).toBe('playing');
    expect(yes.view.difficulty).toBe(1);
    expect(yes.view.wordLength).toBe(5);
    expect(yes.view.name).toBe('Прошитый');
    expect(yes.view.attempts).toBe(4);
    const no = applyLocalTerminalAction(play(), 'retryNo', undefined, ctx());
    expect(no.view.status).toBe('closed');
    expect(applyLocalTerminalAction(no, 'start', undefined, ctx()).error).toBe('TERMINAL_CLOSED');
    expect(applyLocalTerminalAction(no, 'guess', 'x', ctx()).error).toBe('TERMINAL_CLOSED');
  });
});
