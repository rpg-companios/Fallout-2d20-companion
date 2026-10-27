// roomClient (gm-rooms §3.6): очередь до открытия, flush по onopen,
// heartbeat, reconnect с backoff, ручное закрытие без переподключения.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';

class MockWebSocket {
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  emit(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('roomClient', () => {
  let statuses;
  let messages;
  let factory;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    statuses = [];
    messages = [];
    factory = (url) => new MockWebSocket(url);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeClient = (overrides = {}) => createRoomClient({
    url: 'ws://test/ws',
    clientId: 'c1',
    onStatus: (s) => statuses.push(s),
    onMessage: (m) => messages.push(m),
    webSocketFactory: factory,
    ...overrides,
  });

  it('очередь до открытия, flush и конверт протокола по onopen', () => {
    const client = makeClient();
    expect(statuses).toEqual(['connecting']);
    client.send(ROOM_MESSAGE.ROOM_JOIN, { code: 'GM-AAAAAA' }, 'GM-AAAAAA');
    const socket = MockWebSocket.instances[0];
    expect(socket.sent).toHaveLength(0);

    socket.open();
    expect(statuses).toEqual(['connecting', 'online']);
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toMatchObject({
      v: 1,
      type: ROOM_MESSAGE.ROOM_JOIN,
      roomCode: 'GM-AAAAAA',
      clientId: 'c1',
    });
    expect(socket.sent[0].payload.code).toBe('GM-AAAAAA');
    client.close();
  });

  it('heartbeat шлёт presence.ping по открытому сокету', () => {
    const client = makeClient();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.sent.length = 0;
    vi.advanceTimersByTime(26 * 1000);
    expect(socket.sent.some((m) => m.type === ROOM_MESSAGE.PRESENCE_PING)).toBe(true);
    client.close();
  });

  it('входящие конверты парсятся и уходят обработчику; мусор игнорируется', () => {
    makeClient();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.emit({ type: 'x', payload: { a: 1 } });
    socket.onmessage?.({ data: 'не json' });
    expect(messages).toEqual([{ type: 'x', payload: { a: 1 } }]);
  });

  it('reconnect с backoff: безуспешные попытки растут (1с → 2с)', () => {
    makeClient();
    const first = MockWebSocket.instances[0];
    first.open();
    first.close();
    expect(statuses.at(-1)).toBe('offline');
    expect(MockWebSocket.instances).toHaveLength(1);

    // attempt 0 → 1000 мс.
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
    // Вторая попытка не открылась (сокет закрылся до onopen) → attempt 1 → 2000 мс.
    MockWebSocket.instances[1].close();

    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('успешное открытие сбрасывает backoff (снова 1с)', () => {
    makeClient();
    const first = MockWebSocket.instances[0];
    first.open();
    first.close();
    vi.advanceTimersByTime(1000);
    const second = MockWebSocket.instances[1];
    second.open(); // успех → attempt = 0
    second.close();
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('ручное close не переподключается и глушит очередь отправки статусом offline', () => {
    const client = makeClient();
    const socket = MockWebSocket.instances[0];
    socket.open();
    client.close();
    expect(statuses.at(-1)).toBe('offline');
    vi.advanceTimersByTime(30 * 1000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('пользовательская кривая задержек инъецируется (тесты не зависят от генератора)', () => {
    const delays = [];
    makeClient({ reconnectDelayMs: (attempt) => { delays.push(attempt); return 5; } });
    const first = MockWebSocket.instances[0];
    first.open();
    first.close();
    vi.advanceTimersByTime(5);
    // Вторая попытка не открылась → растущий attempt = 1.
    MockWebSocket.instances[1].close();
    vi.advanceTimersByTime(5);
    expect(delays).toEqual([0, 1]);
  });
});
