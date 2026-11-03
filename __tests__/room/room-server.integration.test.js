// Интеграция комнатного сервера по сети (gm-rooms, этап 0–2): поднимаем
// http+ws на случайном порту, ходим двумя ws-клиентами: create → join →
// presence → publish-релей → отключение. Критерий этапа 0: два клиента
// видят друг друга.

import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createRoomServer } from '../../server/roomServer.js';
import { MESSAGE, PROTOCOL_VERSION } from '../../server/protocol.js';
import { toCanonicalRoomCode } from '../../server/roomCode.js';

let requestCounter = 0;
const makeClient = (port, clientId) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [];
  const waiters = [];
  const push = (msg) => {
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].predicate(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
        return;
      }
    }
    inbox.push(msg);
  };
  ws.on('message', (raw) => push(JSON.parse(raw.toString())));
  const opened = new Promise((resolve) => ws.once('open', resolve));
  return {
    clientId,
    async send(type, payload = {}, roomCode = null) {
      await opened;
      requestCounter += 1;
      const requestId = `t-${requestCounter}`;
      ws.send(JSON.stringify({
        v: PROTOCOL_VERSION, type, roomCode, clientId, ts: Date.now(), payload: { ...payload, requestId },
      }));
      return requestId;
    },
    sendRaw(type, payload = {}, roomCode = null) {
      return opened.then(() => ws.send(JSON.stringify({
        v: PROTOCOL_VERSION, type, roomCode, clientId, ts: Date.now(), payload,
      })));
    },
    waitFor(predicate, timeoutMs = 3000) {
      const buffered = inbox.findIndex(predicate);
      if (buffered >= 0) return Promise.resolve(inbox.splice(buffered, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('waitFor: таймаут')), timeoutMs);
        waiters.push({ predicate, resolve: (msg) => { clearTimeout(timer); resolve(msg); } });
      });
    },
    close: () => ws.close(),
  };
};

const withServer = async (fn) => {
  const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent-dist' });
  const address = await app.start();
  try {
    await fn(address.port, app);
  } finally {
    await app.close();
  }
};

describe('roomServer: create/join/presence', () => {
  it('два клиента видят друг друга (критерий этапа 0)', async () => {
    await withServer(async (port) => {
      const gm = makeClient(port, 'gm-1');
      const player = makeClient(port, 'player-1');

      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Стол' });
      const created = await gm.waitFor((m) => m.type === MESSAGE.ROOM_CREATED && m.payload.requestId === createReq);
      expect(created.payload.code).toMatch(/^GM-[A-Z2-9]{6}$/);
      expect(created.payload.ownerToken).toHaveLength(32);
      expect(toCanonicalRoomCode(created.payload.code)).toBe(created.payload.code);

      const joinReq = await player.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'Иван' });
      const state = await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE && m.payload.requestId === joinReq);
      expect(state.payload.members).toEqual([{ clientId: 'player-1', name: 'Иван', role: 'player' }]);
      expect(state.payload.capabilities).toMatchObject({ terminalHacking: true });

      // Мастер входит как gm и видит игрока в списке.
      await gm.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'GM', role: 'gm' });
      const gmState = await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      expect(gmState.payload.members.map((m) => m.name).sort()).toEqual(['GM', 'Иван']);

      gm.close();
      player.close();
    });
  });

  it('presence: уход одного видят остальные', async () => {
    await withServer(async (port) => {
      const gm = makeClient(port, 'gm-1');
      const player = makeClient(port, 'player-1');
      const joinReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Стол' });
      const created = await gm.waitFor((m) => m.payload.requestId === joinReq);
      await gm.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'GM', role: 'gm' });
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await player.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'Иван' });
      await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      // Игрок обновляет список у мастера (broadcast на вход), затем на выход.
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_MEMBER && m.payload.members.some((x) => x.name === 'Иван'));
      await player.send(MESSAGE.ROOM_LEAVE, {}, created.payload.code);
      const afterLeave = await gm.waitFor((m) => m.type === MESSAGE.ROOM_MEMBER && !m.payload.members.some((x) => x.name === 'Иван'));
      expect(afterLeave.payload.members.some((x) => x.name === 'GM')).toBe(true);
      gm.close();
      player.close();
    });
  });

  it('char.publish релеится остальным, отправителю — нет; в state позднему входящему едет снапшот', async () => {
    await withServer(async (port) => {
      const gm = makeClient(port, 'gm-1');
      const player = makeClient(port, 'player-1');
      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Стол' });
      const created = await gm.waitFor((m) => m.payload.requestId === createReq);
      await player.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'Иван' });
      await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE);

      // Мастер ещё не вошёл, но игрок публикует — сервер запоминает снапшот.
      await player.sendRaw(MESSAGE.CHAR_PUBLISH, { characterId: 'char-1', revision: 1, snapshot: { name: 'Иван' } }, created.payload.code);
      await gm.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'GM', role: 'gm' });
      const gmState = await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      expect(gmState.payload.snapshots).toHaveLength(1);
      expect(gmState.payload.snapshots[0]).toMatchObject({ characterId: 'char-1', revision: 1 });

      // Живая публикация долетает до другого члена.
      const liveExpectation = gm.waitFor((m) => m.type === MESSAGE.CHAR_PUBLISH && m.payload.characterId === 'char-1');
      await player.sendRaw(MESSAGE.CHAR_PUBLISH, { characterId: 'char-1', revision: 2, snapshot: { name: 'Иван-2' } }, created.payload.code);
      const live = await liveExpectation;
      expect(live.payload.fromName).toBe('Иван');
      gm.close();
      player.close();
    });
  });

  it('terminal.issue и terminal.action синхронизируют комнатную доску и оператора', async () => {
    await withServer(async (port) => {
      const gm = makeClient(port, 'gm-terminal');
      const operator = makeClient(port, 'player-terminal-1');
      const observer = makeClient(port, 'player-terminal-2');
      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Vault' });
      const created = await gm.waitFor((m) => m.type === MESSAGE.ROOM_CREATED && m.payload.requestId === createReq);
      const code = created.payload.code;
      await gm.send(MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm' });
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await operator.send(MESSAGE.ROOM_JOIN, { code, name: 'Operator', role: 'player' });
      await operator.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await observer.send(MESSAGE.ROOM_JOIN, { code, name: 'Observer', role: 'player' });
      await observer.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await operator.sendRaw(MESSAGE.CHAR_PUBLISH, {
        characterId: 'char-terminal-1',
        revision: 1,
        snapshot: { name: 'Operator', data: { characterName: 'Operator', attributes: { INT: { value: 4 } }, skills: [] } },
      }, code);
      await observer.sendRaw(MESSAGE.CHAR_PUBLISH, {
        characterId: 'char-terminal-2',
        revision: 1,
        snapshot: { name: 'Observer', data: { characterName: 'Observer', attributes: { INT: { value: 4 } }, skills: [] } },
      }, code);

      const issueReq = await gm.send(MESSAGE.TERMINAL_ISSUE, {
        config: { containerId: 'term-1', name: 'Vault terminal', difficulty: 2 },
      }, code);
      const issued = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === issueReq);
      expect(issued.payload.terminal).toMatchObject({ containerId: 'term-1', standaloneIssued: true, game: null });

      const startReq = await operator.send(MESSAGE.TERMINAL_ACTION, {
        containerId: 'term-1', action: 'start', characterId: 'char-terminal-1',
      }, code);
      const started = await operator.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === startReq);
      expect(started.payload.terminal.game).toMatchObject({ operatorClientId: 'player-terminal-1', operatorCharacterId: 'char-terminal-1', status: 'playing' });
      expect(started.payload.terminal.game.password).toBeUndefined();

      const observerState = await observer.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.terminal?.containerId === 'term-1' && m.payload.terminal?.game?.status === 'playing');
      expect(observerState.payload.terminal.game.operatorClientId).toBe('player-terminal-1');
      // Патч 503: «Взломать» от другого персонажа собирает доску под ЕГО лист.
      // Партия остаётся одна на всех; прежний оператор становится зрителем.
      const takeoverReq = await observer.send(MESSAGE.TERMINAL_ACTION, {
        containerId: 'term-1', action: 'start', characterId: 'char-terminal-2',
      }, code);
      const takeover = await observer.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === takeoverReq);
      expect(takeover.payload.terminal.game).toMatchObject({
        operatorClientId: 'player-terminal-2', operatorCharacterId: 'char-terminal-2', status: 'playing',
      });
      // Повторный start от того же оператора не сбрасывает его прогресс.
      const repeatReq = await observer.send(MESSAGE.TERMINAL_ACTION, {
        containerId: 'term-1', action: 'start', characterId: 'char-terminal-2',
      }, code);
      const repeat = await observer.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === repeatReq);
      expect(repeat.payload.code).toBe('TERMINAL_ALREADY_ACTIVE');
      // Прежний оператор теперь только наблюдает.
      const oldGuessReq = await operator.send(MESSAGE.TERMINAL_ACTION, {
        containerId: 'term-1', action: 'guess', characterId: 'char-terminal-1',
        value: takeover.payload.terminal.game.wordRanges[0].id,
      }, code);
      const oldGuess = await operator.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === oldGuessReq);
      expect(oldGuess.payload.code).toBe('TERMINAL_VIEW_ONLY');

      gm.close();
      operator.close();
      observer.close();
    });
  });

  it('peer.assist ставит лечение соседа в общую очередь, доставляет его цели и фиксирует ack', async () => {
    await withServer(async (port) => {
      const gm = makeClient(port, 'gm-peer');
      const medic = makeClient(port, 'player-medic');
      const wounded = makeClient(port, 'player-wounded');

      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Полевая помощь' });
      const created = await gm.waitFor((m) => m.type === MESSAGE.ROOM_CREATED && m.payload.requestId === createReq);
      const code = created.payload.code;
      await gm.send(MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm' });
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await medic.send(MESSAGE.ROOM_JOIN, { code, name: 'Доктор Ли', role: 'player' });
      await medic.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await wounded.send(MESSAGE.ROOM_JOIN, { code, name: 'Рейнджер', role: 'player' });
      await wounded.waitFor((m) => m.type === MESSAGE.ROOM_STATE);

      await wounded.sendRaw(MESSAGE.CHAR_PUBLISH, {
        characterId: 'wounded-char',
        revision: 1,
        snapshot: { characterId: 'wounded-char', name: 'Рейнджер', data: { currentHealth: 2 } },
      }, code);
      // Ожидаем, пока сервер зарегистрирует снапшот цели.
      await gm.waitFor((m) => m.type === MESSAGE.CHAR_PUBLISH && m.payload.characterId === 'wounded-char');

      const peerRequest = await medic.send(MESSAGE.PEER_ASSIST, {
        code,
        targetCharacterId: 'wounded-char',
        fromCharacterName: 'Доктор Ли',
        envPayload: {
          item: { id: 'chem_stimpak', name: 'Стимулятор', healAmount: 4 },
          firstAidBonusHp: 7,
          stabilizeInjury: true,
        },
      }, code);
      const queued = await medic.waitFor((m) => (
        m.type === MESSAGE.GM_DIRECTIVE_STATE && m.payload.requestId === peerRequest
      ));
      expect(queued.payload.directive).toMatchObject({
        kind: 'peer.consumable',
        originRole: 'peer',
        targetCharacterId: 'wounded-char',
      });
      expect(queued.payload.directive.envPayload.firstAidBonusHp).toBe(7);

      const delivered = await wounded.waitFor((m) => (
        m.type === MESSAGE.GM_DIRECTIVE && m.payload.directiveId === queued.payload.directive.directiveId
      ));
      expect(delivered.payload.kind).toBe('peer.consumable');
      expect(delivered.payload.fromName).toBe('Доктор Ли');

      const ackRequest = await wounded.send(MESSAGE.GM_DIRECTIVE_ACK, {
        code,
        directiveId: queued.payload.directive.directiveId,
        characterId: 'wounded-char',
      }, code);
      const acked = await wounded.waitFor((m) => (
        m.type === MESSAGE.GM_DIRECTIVE_STATE && m.payload.requestId === ackRequest
      ));
      expect(acked.payload.directive.ackedByCharacterIds).toContain('wounded-char');
      gm.close();
      medic.close();
      wounded.close();
    });
  });

  // Патч 504: провал доходит до Мастера как awaitingGm, «Да» пересобирает
  // доску по свежим настройкам, «Нет» закрывает терминал до новой трансляции.
  it('504: решение Мастера о повторном взломе синхронизируется по WS', async () => {
    await withServer(async (port, app) => {
      const gm = makeClient(port, 'gm-504');
      const player = makeClient(port, 'player-504');
      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Vault 504' });
      const created = await gm.waitFor((m) => m.type === MESSAGE.ROOM_CREATED && m.payload.requestId === createReq);
      const code = created.payload.code;
      await gm.send(MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm' });
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await player.send(MESSAGE.ROOM_JOIN, { code, name: 'Оператор', role: 'player' });
      await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await player.sendRaw(MESSAGE.CHAR_PUBLISH, {
        characterId: 'char-504', revision: 1,
        snapshot: { characterName: 'Оператор', data: { attributes: { INT: { value: 4 } }, skills: [] } },
      }, code);

      const config = { containerId: 'term-504', name: 'Терминал', difficulty: 5 };
      const issueReq = await gm.send(MESSAGE.TERMINAL_ISSUE, { config }, code);
      await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === issueReq);
      const startReq = await player.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'start', characterId: 'char-504',
      }, code);
      const started = await player.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === startReq);
      expect(started.payload.terminal).toMatchObject({ awaitingGm: false, closed: false });

      // Скрытый пароль берём из реестра: публичное состояние его не выдаёт.
      const hidden = app.registry._rooms.get(code).terminalStates.get(config.containerId).game;
      const wrong = hidden.wordRanges.filter((range) => range.word !== hidden.password).slice(0, 4);
      let last = null;
      for (const range of wrong) {
        const req = await player.send(MESSAGE.TERMINAL_ACTION, {
          containerId: config.containerId, action: 'guess', characterId: 'char-504', value: range.id,
        }, code);
        last = await player.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === req);
      }
      expect(last.payload.terminal.game).toMatchObject({ status: 'awaitingRetry', result: 'ATTEMPTS EXHAUSTED' });
      expect(last.payload.terminal.awaitingGm).toBe(true);
      // Мастер получил то же состояние — именно по нему всплывает вопрос.
      const gmPrompt = await gm.waitFor((m) => (
        m.type === MESSAGE.TERMINAL_STATE && m.payload.terminal?.awaitingGm === true
      ));
      expect(gmPrompt.payload.terminal.game.status).toBe('awaitingRetry');

      // Игрок не может начать заново без ответа Мастера.
      const deniedReq = await player.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'start', characterId: 'char-504',
      }, code);
      const denied = await player.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === deniedReq);
      expect(denied.payload.code).toBe('TERMINAL_AWAITING_RETRY');

      // Мастер меняет настройки и отвечает «Да»: сразу свежая доска.
      const editReq = await gm.send(MESSAGE.TERMINAL_ISSUE, {
        config: { ...config, name: 'Перепрошитый', difficulty: 1 },
      }, code);
      const edited = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === editReq);
      expect(edited.payload.terminal.awaitingGm).toBe(true);
      const yesReq = await gm.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'retry', value: 'yes',
      }, code);
      const yes = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === yesReq);
      expect(yes.payload.terminal).toMatchObject({ awaitingGm: false, closed: false });
      expect(yes.payload.terminal.game).toMatchObject({
        status: 'playing', difficulty: 1, wordLength: 5, name: 'Перепрошитый', attempts: 4,
      });
      const playerYes = await player.waitFor((m) => (
        m.type === MESSAGE.TERMINAL_STATE && m.payload.terminal?.game?.status === 'playing'
        && m.payload.terminal?.game?.difficulty === 1
      ));
      expect(playerYes.payload.terminal.game.attempts).toBe(4);

      // Второй провал и ответ «Нет»: карточка «Закрыт», обе кнопки запрещены.
      const hidden2 = app.registry._rooms.get(code).terminalStates.get(config.containerId).game;
      const wrong2 = hidden2.wordRanges.filter((range) => range.word !== hidden2.password).slice(0, 4);
      for (const range of wrong2) {
        const req = await player.send(MESSAGE.TERMINAL_ACTION, {
          containerId: config.containerId, action: 'guess', characterId: 'char-504', value: range.id,
        }, code);
        await player.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === req);
      }
      const noReq = await gm.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'retry', value: 'no',
      }, code);
      const no = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === noReq);
      expect(no.payload.terminal).toMatchObject({ closed: true, locked: true, awaitingGm: false });
      expect(no.payload.terminal.game.status).toBe('closed');
      const closedReq = await player.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'start', characterId: 'char-504',
      }, code);
      const closed = await player.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === closedReq);
      expect(closed.payload.code).toBe('TERMINAL_CLOSED');

      // Новая трансляция Мастера снимает «Закрыт».
      const reissueReq = await gm.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'reissue',
      }, code);
      const reissued = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === reissueReq);
      expect(reissued.payload.terminal).toMatchObject({ closed: false, game: null });

      gm.close();
      player.close();
    });
  });

  // Патч 505: ACCESS GRANTED больше не стирается лишним `start` окна взлома.
  // Воспроизводим две вкладки одного браузера: второе соединение с тем же
  // листом персонажа раньше расценивалось как передача хода и собирало новую
  // доску, а Мастер не получал уведомления об успехе.
  it('505: победа не пересобирает доску и приходит Мастеру', async () => {
    await withServer(async (port, app) => {
      const gm = makeClient(port, 'gm-505');
      const player = makeClient(port, 'player-505');
      const secondTab = makeClient(port, 'player-505-tab2');
      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Vault 505' });
      const created = await gm.waitFor((m) => m.type === MESSAGE.ROOM_CREATED && m.payload.requestId === createReq);
      const code = created.payload.code;
      await gm.send(MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm' });
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await player.send(MESSAGE.ROOM_JOIN, { code, name: 'Оператор', role: 'player' });
      await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await secondTab.send(MESSAGE.ROOM_JOIN, { code, name: 'Оператор (вкладка 2)', role: 'player' });
      await secondTab.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      const sheet = {
        characterName: 'Оператор',
        data: { attributes: { INT: { value: 8 }, LCK: { value: 6 } }, skills: [] },
      };
      await player.sendRaw(MESSAGE.CHAR_PUBLISH, {
        characterId: 'char-505', revision: 1, snapshot: sheet,
      }, code);

      const config = { containerId: 'term-505', name: 'Терминал', difficulty: 3 };
      const issueReq = await gm.send(MESSAGE.TERMINAL_ISSUE, { config }, code);
      await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === issueReq);
      const startReq = await player.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'start', characterId: 'char-505',
      }, code);
      const started = await player.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === startReq);
      expect(started.payload.terminal.game.wordLength).toBe(7);

      // Угадываем пароль: его знает только сервер, публичное состояние — нет.
      const hidden = app.registry._rooms.get(code).terminalStates.get(config.containerId).game;
      const passwordRange = hidden.wordRanges.find((range) => range.word === hidden.password);
      const winReq = await player.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'guess', characterId: 'char-505', value: passwordRange.id,
      }, code);
      const won = await player.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === winReq);
      expect(won.payload.terminal.game).toMatchObject({ status: 'won', result: 'ACCESS GRANTED' });
      expect(won.payload.terminal.awaitingGm).toBe(false);
      expect(won.payload.terminal.game.password).toBeUndefined();
      // Именно по этому состоянию Мастеру всплывает «Терминал взломан».
      const gmWon = await gm.waitFor((m) => (
        m.type === MESSAGE.TERMINAL_STATE && m.payload.terminal?.game?.status === 'won'
      ));
      expect(gmWon.payload.terminal.game.result).toBe('ACCESS GRANTED');

      // Вторая вкладка публикует тот же лист от своего clientId и шлёт start.
      await secondTab.sendRaw(MESSAGE.CHAR_PUBLISH, {
        characterId: 'char-505', revision: 2, snapshot: sheet,
      }, code);
      // Дожидаемся, что сервер обработал публикацию на этом соединении.
      await secondTab.send(MESSAGE.PRESENCE_PING, {});
      await secondTab.waitFor((m) => m.type === MESSAGE.PRESENCE_PONG);
      const againReq = await secondTab.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'start', characterId: 'char-505',
      }, code);
      const again = await secondTab.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === againReq);
      expect(again.payload.code).toBe('TERMINAL_ALREADY_ACTIVE');
      expect(app.registry._rooms.get(code).terminalStates.get(config.containerId).game.status).toBe('won');

      // Новая партия — только по явной повторной трансляции Мастера.
      const reissueReq = await gm.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'reissue',
      }, code);
      const reissued = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === reissueReq);
      expect(reissued.payload.terminal.game).toBeNull();
      // Лист теперь опубликован со второй вкладки, она и начинает новую партию.
      const freshReq = await secondTab.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'start', characterId: 'char-505',
      }, code);
      const fresh = await secondTab.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === freshReq);
      expect(fresh.payload.terminal.game).toMatchObject({ status: 'playing', attempts: 4 });

      gm.close();
      player.close();
      secondTab.close();
    });
  });

  // Патч 506: выход игрока из локации персональный, а билет доступа к
  // терминалу обновляется только после явной повторной трансляции Мастера.
  it('506: игрок покидает локацию, остальные остаются; reissue выдаёт новый accessId', async () => {
    await withServer(async (port, app) => {
      const gm = makeClient(port, 'gm-506');
      const player = makeClient(port, 'player-506');
      const other = makeClient(port, 'player-506-other');
      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Vault 506' });
      const created = await gm.waitFor((m) => m.type === MESSAGE.ROOM_CREATED && m.payload.requestId === createReq);
      const code = created.payload.code;
      await gm.send(MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm' });
      await gm.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await player.send(MESSAGE.ROOM_JOIN, { code, name: 'Первый', role: 'player' });
      await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE);
      await other.send(MESSAGE.ROOM_JOIN, { code, name: 'Второй', role: 'player' });
      await other.waitFor((m) => m.type === MESSAGE.ROOM_STATE);

      const config = { containerId: 'term-506', name: 'Терминал', difficulty: 3 };
      const issueReq = await gm.send(MESSAGE.TERMINAL_ISSUE, { config }, code);
      const issued = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === issueReq);
      const firstAccessId = issued.payload.terminal.accessId;
      expect(firstAccessId).toMatch(/^broadcast-\d+$/);

      const openReq = await gm.send(MESSAGE.SESSION_OPEN, {
        session: {
          kind: 'hub', name: 'Убежище', targetType: 'room',
          nodes: [{ containerId: config.containerId, kind: 'terminal', name: 'Терминал', difficulty: 3 }],
        },
      }, code);
      const opened = await gm.waitFor((m) => m.type === MESSAGE.SESSION_STATE && m.payload.requestId === openReq);
      const sessionId = opened.payload.session.sessionId;
      expect(opened.payload.session.kind).toBe('hub');

      // Игрок уходит сам: сессия Мастера остаётся активной.
      const leaveReq = await player.send(MESSAGE.SESSION_PLAYER_CLOSE, { sessionId }, code);
      const left = await player.waitFor((m) => m.type === MESSAGE.SESSION_STATE && m.payload.requestId === leaveReq);
      expect(left.payload.session).toBeTruthy();
      expect(left.payload.session.kind).toBe('hub');
      expect(left.payload.session.closedByClientIds).toContain(player.clientId);
      expect(left.payload.session.closedByClientIds).not.toContain(other.clientId);
      expect(app.registry.getRoom(code).activeSession).toBeTruthy();
      const otherState = await other.waitFor((m) => (
        m.type === MESSAGE.SESSION_STATE && m.payload.session?.closedByClientIds?.includes(player.clientId)
      ));
      expect(otherState.payload.session.sessionId).toBe(sessionId);

      // Повторная трансляция терминала выдаёт новый билет доступа.
      const reissueReq = await gm.send(MESSAGE.TERMINAL_ACTION, {
        containerId: config.containerId, action: 'reissue',
      }, code);
      const reissued = await gm.waitFor((m) => m.type === MESSAGE.TERMINAL_STATE && m.payload.requestId === reissueReq);
      expect(reissued.payload.terminal.accessId).not.toBe(firstAccessId);

      gm.close();
      player.close();
      other.close();
    });
  });

  it('ошибки: комната не найдена, чужая директива, неизвестный тип', async () => {
    await withServer(async (port) => {
      const gm = makeClient(port, 'gm-1');
      const player = makeClient(port, 'player-1');

      const missReq = await player.send(MESSAGE.ROOM_JOIN, { code: 'GM-AAAAAA', name: 'Иван' });
      const miss = await player.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === missReq);
      expect(miss.payload.code).toBe('ROOM_NOT_FOUND');

      const createReq = await gm.send(MESSAGE.ROOM_CREATE, { name: 'Стол' });
      const created = await gm.waitFor((m) => m.payload.requestId === createReq);
      await player.send(MESSAGE.ROOM_JOIN, { code: created.payload.code, name: 'Иван' });
      await player.waitFor((m) => m.type === MESSAGE.ROOM_STATE);

      const directiveReq = await player.send(MESSAGE.GM_DIRECTIVE, { kind: 'state.add' }, created.payload.code);
      const denied = await player.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === directiveReq);
      expect(denied.payload.code).toBe('NOT_ROOM_OWNER');

      const unknownReq = await gm.send('bogus.type', {}, null);
      const unknown = await gm.waitFor((m) => m.type === MESSAGE.ERROR && m.payload.requestId === unknownReq);
      expect(unknown.payload.code).toBe('UNKNOWN_TYPE');

      gm.close();
      player.close();
    });
  });
});
