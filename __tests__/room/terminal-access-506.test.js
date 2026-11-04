// Приёмочный тест 506. Владелец проверял игру в одном браузере в двух
// вкладках и сообщил: «я во вкладке мастера не вижу уведомление, что
// терминал взломан. А игроком я могу закрыть терминал … и могу терминал
// взломать ещё раз и ещё и ещё. Терминал не должен открываться снова.
// Игроки должны иметь возможность сами отключаться от локации по кнопке
// "покинуть локацию" рядом с кнопкой "свернуть"».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  terminalAccessKey,
  canHackTerminal,
  terminalBlockedReason,
} from '../../components/lootTrade/terminalAccess.js';
import { isGmRoom, findPending, findCompleted } from '../../components/lootTrade/terminalRetryPrompt.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const CONFIG = { containerId: 't1', name: 'Терминал', description: '', difficulty: 3 };

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm-1' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Второй', role: 'player' });
  registry.issueTerminal({ code: room.code, clientId: 'gm-1', config: CONFIG });
  const state = () => registry.getState(room.code).terminalStates.t1;
  const act = (clientId, characterId, action, value) => registry.terminalAction({
    code: room.code, clientId, characterId, containerId: 't1', action, value,
  });
  return { registry, room, state, act };
};

describe('506 / 526: доступ к точке по усмотрению игрока', () => {
  it('«билет» убран; у терминала remained только блокировка после провала', () => {
    const key = terminalAccessKey({ roomCode: 'R', containerId: 't1', accessId: 'broadcast-1' });
    expect(key).toBe('R|t1|broadcast-1');
    expect(terminalAccessKey({ roomCode: 'R', containerId: 't1', accessId: 'broadcast-2' })).not.toBe(key);
    // Владелец (526): «Юзер может совершать сколько угодно подходов ...
    // Но только по своему усмотрению». Закрытое окно/отметка used больше
    // не запрещают явный подход ни у терминала, ни у замка.
    expect(canHackTerminal({ key, game: { status: 'playing' } })).toBe(true);
    expect(canHackTerminal({ used: { [key]: true }, key, game: { status: 'playing' } })).toBe(true);
    expect(terminalBlockedReason({ used: { [key]: true }, key, game: null })).toBeNull();

    // Терминал: после провала «заблокировано», повтор — на усмотрение Мастера.
    for (const status of ['won', 'awaitingRetry', 'closed']) {
      expect(canHackTerminal({ key, game: { status } })).toBe(false);
      expect(terminalBlockedReason({ key, game: { status } })).toBeTruthy();
    }
    expect(canHackTerminal({ key, terminalClosed: true })).toBe(false);
    expect(canHackTerminal({ key, terminalAwaiting: true })).toBe(false);
    expect(terminalBlockedReason({ key, game: { status: 'won' } })).toBe('won');
    expect(terminalBlockedReason({ key, game: null })).toBeNull();

    // Замок: «пока не блокировать» — ни статус доски, ни закрытие не мешают.
    expect(canHackTerminal({ key, game: { status: 'awaitingRetry' }, isLock: true })).toBe(true);
    expect(canHackTerminal({ key, game: { status: 'won' }, isLock: true })).toBe(true);
    expect(canHackTerminal({ key, terminalClosed: true, isLock: true })).toBe(true);
    expect(terminalBlockedReason({ key, game: { status: 'awaitingRetry' }, isLock: true })).toBeNull();
  });

  it('Мастера не спрашивают про замок, но спрашивают про терминал', () => {
    const gmRoom = (config) => ({
      R: {
        role: 'gm',
        terminalStates: {
          t1: { config, closed: false, game: { status: 'awaitingRetry', revision: 3 } },
        },
      },
    });
    expect(findPending(gmRoom({ kind: 'lock', name: 'Замок' }))).toEqual([]);
    expect(findPending(gmRoom({ kind: 'terminal', name: 'Терминал' }))).toHaveLength(1);
  });

  it('accessId стабилен на ходах и при правке карточки, обновляется при повторной трансляции', () => {
    const { registry, room, state } = setup();
    const first = state().accessId;
    expect(first).toMatch(/^broadcast-\d+$/);
    // Правка настроек во время доступа — не новая трансляция.
    registry.issueTerminal({
      code: room.code, clientId: 'gm-1',
      config: { ...CONFIG, name: 'Переименованный', difficulty: 1 },
    });
    expect(state().accessId).toBe(first);
    // Явная повторная трансляция Мастера.
    registry.issueTerminal({ code: room.code, clientId: 'gm-1', config: CONFIG, reissue: true });
    const second = state().accessId;
    expect(second).not.toBe(first);
    // reissue-действие и «Да» после провала тоже выдают новый билет.
    registry.terminalAction({ code: room.code, clientId: 'gm-1', containerId: 't1', action: 'reissue' });
    expect(state().accessId).not.toBe(second);
  });

  it('открытие локации — новая трансляция, updateSession — нет', () => {
    const { registry, room, state } = setup();
    const before = state().accessId;
    registry.openSession({
      code: room.code, clientId: 'gm-1',
      session: {
        kind: 'hub', name: 'Убежище', targetType: 'room',
        nodes: [{ containerId: 't1', kind: 'terminal', name: 'T', difficulty: 3 }],
      },
    });
    const afterOpen = state().accessId;
    expect(afterOpen).not.toBe(before);
    registry.updateSession({
      code: room.code, clientId: 'gm-1',
      payload: { nodeContainerId: 't1', nodeDifficulty: 4 },
    });
    expect(state().accessId).toBe(afterOpen);
  });
});

describe('506: Мастера определяют по участнику, а не по UI-режиму вкладки', () => {
  const won = {
    closed: false,
    config: { name: 'Терминал', difficulty: 3 },
    game: { status: 'won', revision: 7, operatorName: 'Оператор' },
  };
  const rooms = (role, members) => ({ R: { role, members, terminalStates: { t1: won } } });

  it('role gm по-прежнему работает', () => {
    expect(isGmRoom({ role: 'gm' })).toBe(true);
    expect(findCompleted(rooms('gm', []))).toHaveLength(1);
  });

  it('вкладка с role player, но с моим gm-участником получает уведомление', () => {
    const list = rooms('player', [
      { clientId: 'gm-tab', role: 'gm' },
      { clientId: 'player-tab', role: 'player' },
    ]);
    expect(isGmRoom(list.R, 'gm-tab')).toBe(true);
    expect(findCompleted(list, 'gm-tab')).toHaveLength(1);
    expect(findCompleted(list, 'player-tab')).toHaveLength(0);
  });

  it('вопрос о повторном взломе использует тот же признак владельца', () => {
    const pendingTerminal = { ...won, game: { status: 'awaitingRetry', revision: 7 }, awaitingGm: true };
    const list = { R: {
      role: 'player',
      members: [{ clientId: 'gm-tab', role: 'gm' }],
      terminalStates: { t1: pendingTerminal },
    } };
    expect(findPending(list, 'gm-tab')).toHaveLength(1);
    expect(findPending(list, 'other-tab')).toHaveLength(0);
  });

  it('хост не ждёт БД перед показом и AlertHost рисуется поверх «Что нового»', () => {
    const host = read('components/lootTrade/TerminalRetryPromptHost.js');
    const app = read('App.js');
    expect(host).toContain('Promise.race');
    expect(host).toContain('findCompleted(state?.rooms, clientId)');
    expect(app.indexOf('<UpdateNoticeModal />')).toBeLessThan(app.indexOf('<AlertHost />'));
  });
});

describe('506: игрок сам покидает локацию, сессия остаётся для остальных', () => {
  const openHub = (registry, room) => registry.openSession({
    code: room.code, clientId: 'gm-1',
    session: {
      kind: 'hub', name: 'Убежище', targetType: 'room',
      nodes: [{ containerId: 't1', kind: 'terminal', name: 'T', difficulty: 3 }],
    },
  });

  it('playerCloseSession для hub не гасит сессию и помечает только ушедшего', () => {
    const { registry, room } = setup();
    openHub(registry, room);
    const before = registry.getState(room.code).activeSession;
    expect(before.kind).toBe('hub');
    const result = registry.playerCloseSession({ code: room.code, clientId: 'p1', sessionId: before.sessionId });
    expect(result.error).toBeUndefined();
    expect(result.session).toBeTruthy();
    expect(result.session.kind).toBe('hub');
    expect(result.closedSession).toBeNull();
    expect(result.session.closedByClientIds).toContain('p1');
    expect(result.session.closedByClientIds).not.toContain('p2');
    expect(registry.getState(room.code).activeSession.sessionId).toBe(before.sessionId);
    // Второй игрок тоже может уйти — сессия всё ещё живёт.
    const second = registry.playerCloseSession({ code: room.code, clientId: 'p2', sessionId: before.sessionId });
    expect(second.session.closedByClientIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(registry.getState(room.code).activeSession).toBeTruthy();
  });

  it('кнопка «Покинуть локацию» рядом со «Свернуть» и подписи RU/EN на месте', () => {
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).toContain('testID="leave-hub-button"');
    expect(overlay).toContain("tLootTrade('player.leaveHub')");
    expect(overlay).toContain("tLootTrade('player.minimize')");
    expect(overlay).toContain('playerCloseRoomSession');
    // Патч 526: «билет» убран — игрок сам решает, когда вернуться к точке.
    expect(overlay).not.toContain('markTerminalAccess');
    expect(overlay).toContain('markSessionClosedLocally(session.sessionId)');
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    expect(ru.player.leaveHub).toBe('Покинуть локацию');
    expect(en.player.leaveHub).toBe('Leave location');
    expect(ru.terminal.accessUsed).toBeTruthy();
    expect(en.terminal.accessUsed).toBeTruthy();
  });
});
