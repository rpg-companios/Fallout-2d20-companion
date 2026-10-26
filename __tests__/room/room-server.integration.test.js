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
    await fn(address.port);
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
