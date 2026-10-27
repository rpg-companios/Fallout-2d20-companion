// roomStore поверх мок-транспорта (gm-rooms, этапы 0–2): create/join/leave,
// сопоставление ответов по requestId, presence-обновления, ошибки сервера
// мапятся в коды для UI. Мок-клиент записывает отправленное и принимает
// «входящие» сообщения из теста; отправка из store-экшенов — через микротаск
// промиса, поэтому тесты ждут flush() перед взглядом в журнал.

import { beforeEach, describe, expect, it } from 'vitest';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const makeMockClient = () => {
  const mock = {
    sent: [],
    handlers: null,
    send(type, payload, roomCode) {
      mock.sent.push({ type, payload, roomCode });
    },
    close() {},
    getStatus: () => 'online',
    emit(message) { mock.handlers.onMessage(message); },
    setStatus(status) { mock.handlers.onStatus(status); },
  };
  return mock;
};

let mockClient;
let useRoomStore;
let ROOM_MESSAGE;

beforeEach(async () => {
  // Без адреса сервера ensureClient падает (§3.9) — подставляем тестовый.
  process.env.EXPO_PUBLIC_ROOM_SERVER_URL = 'ws://test.invalid/ws';
  mockClient = makeMockClient();
  const storeModule = await import('../../src/room/roomStore');
  useRoomStore = storeModule.default;
  ROOM_MESSAGE = (await import('../../src/room/roomProtocol')).ROOM_MESSAGE;
  storeModule.resetRoomClientForTests();
  storeModule.setRoomClientFactoryForTests(({ onStatus, onMessage }) => {
    mockClient.handlers = { onStatus, onMessage };
    return mockClient;
  });
  useRoomStore.setState({ status: 'offline', rooms: {}, lastError: null });
  await useRoomStore.getState().connect();
});

describe('roomStore: create/join/leave', () => {
  it('createRoom резолвится по requestId и кладёт комнату в стор', async () => {
    const promise = useRoomStore.getState().createRoom({ name: 'Стол' });
    await flush();
    const sent = mockClient.sent.find((m) => m.type === ROOM_MESSAGE.ROOM_CREATE);
    expect(sent).toBeTruthy();
    expect(sent.payload.name).toBe('Стол');
    mockClient.emit({
      type: ROOM_MESSAGE.ROOM_CREATED,
      roomCode: 'GM-ABC123',
      payload: { code: 'GM-ABC123', name: 'Стол', ownerToken: 'tok', requestId: sent.payload.requestId },
    });
    const result = await promise;
    expect(result).toEqual({ code: 'GM-ABC123', name: 'Стол', ownerToken: 'tok' });
    expect(useRoomStore.getState().rooms['GM-ABC123']).toMatchObject({ code: 'GM-ABC123', role: 'gm' });
  });

  it('joinRoom сохраняет членов и дедуплицирует повторный вход', async () => {
    const promise = useRoomStore.getState().joinRoom({ code: 'GM-ABC123', name: 'Иван' });
    await flush();
    const sent = mockClient.sent.find((m) => m.type === ROOM_MESSAGE.ROOM_JOIN);
    mockClient.emit({
      type: ROOM_MESSAGE.ROOM_STATE,
      roomCode: 'GM-ABC123',
      payload: {
        code: 'GM-ABC123',
        name: 'Стол',
        members: [{ clientId: 'p1', name: 'Иван', role: 'player' }],
        snapshots: [],
        requestId: sent.payload.requestId,
      },
    });
    const result = await promise;
    expect(result.members).toHaveLength(1);
    // Повторный вход не ходит в сеть вообще.
    const again = await useRoomStore.getState().joinRoom({ code: 'GM-ABC123', name: 'Иван' });
    expect(again.code).toBe('GM-ABC123');
    expect(mockClient.sent.filter((m) => m.type === ROOM_MESSAGE.ROOM_JOIN)).toHaveLength(1);
  });

  it('presence: room.member обновляет членов известной комнаты', async () => {
    useRoomStore.setState({
      rooms: { 'GM-ABC123': { code: 'GM-ABC123', name: 'Стол', role: 'gm', members: [] } },
    });
    mockClient.emit({
      type: ROOM_MESSAGE.ROOM_MEMBER,
      roomCode: 'GM-ABC123',
      payload: { members: [{ clientId: 'p1', name: 'Иван', role: 'player' }] },
    });
    expect(useRoomStore.getState().rooms['GM-ABC123'].members).toHaveLength(1);
    // Неизвестная комната — молча пропускаем (гонка после leave).
    mockClient.emit({
      type: ROOM_MESSAGE.ROOM_MEMBER,
      roomCode: 'GM-XXXXXX',
      payload: { members: [] },
    });
    expect(useRoomStore.getState().rooms['GM-XXXXXX']).toBeUndefined();
  });

  it('leaveRoom шлёт уход и вычищает комнату из стора', async () => {
    useRoomStore.setState({
      rooms: { 'GM-ABC123': { code: 'GM-ABC123', name: 'Стол', role: 'player', members: [] } },
    });
    await useRoomStore.getState().leaveRoom({ code: 'GM-ABC123' });
    await flush();
    expect(mockClient.sent.some((m) => m.type === ROOM_MESSAGE.ROOM_LEAVE)).toBe(true);
    expect(useRoomStore.getState().rooms['GM-ABC123']).toBeUndefined();
  });

  it('ошибка сервера по requestId → reject с кодом', async () => {
    const promise = useRoomStore.getState().joinRoom({ code: 'GM-XXXXXX', name: 'Иван' });
    await flush();
    const sent = mockClient.sent.find((m) => m.type === ROOM_MESSAGE.ROOM_JOIN);
    mockClient.emit({
      type: ROOM_MESSAGE.ERROR,
      roomCode: 'GM-XXXXXX',
      payload: { code: 'ROOM_NOT_FOUND', requestId: sent.payload.requestId },
    });
    await expect(promise).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('ошибка без requestId → lastError', async () => {
    mockClient.emit({ type: ROOM_MESSAGE.ERROR, payload: { code: 'RATE_LIMITED' } });
    expect(useRoomStore.getState().lastError).toBe('RATE_LIMITED');
  });

  it('статус подключения пробрасывается в стор', async () => {
    mockClient.setStatus('online');
    expect(useRoomStore.getState().status).toBe('online');
    mockClient.setStatus('connecting');
    expect(useRoomStore.getState().status).toBe('connecting');
  });
});
