// src/room/roomClient.ts
// WebSocket-клиент комнат (план gm-rooms §3.6): очередь отправки до открытия,
// heartbeat, reconnect с backoff. Зависимости только платформенные — доменные
// решения принимает roomStore, тесты подставляют мок-WebSocket.

import { ROOM_MESSAGE, ROOM_PROTOCOL_VERSION, type RoomEnvelope } from './roomProtocol';

// tsconfig.types=[]: node-типов нет; в рантайме Expo process.env существует
// (EXPO_PUBLIC_* подставляется на сборке), в тестах — node.
declare const process: { env?: Record<string, string | undefined> } | undefined;

export type RoomConnectionStatus = 'offline' | 'connecting' | 'online';

export interface RoomClientHandlers {
  onStatus: (status: RoomConnectionStatus) => void;
  onMessage: (message: RoomEnvelope) => void;
}

export interface RoomClientOptions extends RoomClientHandlers {
  url: string;
  clientId: string;
  /** Точка подмены для тестов; по умолчанию платформенный WebSocket. */
  webSocketFactory?: (url: string) => WebSocketLike;
  /** Точка подмены таймеров/задержек (тесты с фейк-таймерами). */
  reconnectDelayMs?: (attempt: number) => number;
}

// Минимальный интерфейс, чтобы не тянуть DOM-типы в натив/тесты.
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

const WS_OPEN = 1;
const HEARTBEAT_MS = 25 * 1000;
const MAX_RECONNECT_DELAY_MS = 15 * 1000;

const defaultReconnectDelay = (attempt: number) => (
  Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS)
);

/** Адрес комнатного сервера: env или тот же origin (wss на https). §3.9:
 *  нечего вернуть → мастерского пространства нет (кнопка скрывается). */
export const resolveRoomServerUrl = (): string | null => {
  if (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_ROOM_SERVER_URL) {
    return process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
  }
  if (typeof window !== 'undefined' && window.location?.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return null;
};

/** Признак доступности мастерского пространства (§3.9, часть «сервер»). */
export const isRoomServerConfigured = (): boolean => resolveRoomServerUrl() !== null;

export interface RoomClient {
  send: (type: string, payload?: Record<string, unknown>, roomCode?: string | null) => void;
  close: () => void;
  /** Текущий статус — для диагностики тестов. */
  getStatus: () => RoomConnectionStatus;
}

export const createRoomClient = ({
  url,
  clientId,
  onStatus,
  onMessage,
  webSocketFactory,
  reconnectDelayMs = defaultReconnectDelay,
}: RoomClientOptions): RoomClient => {
  const factory: (wsUrl: string) => WebSocketLike = webSocketFactory
    || ((wsUrl: string) => new (WebSocket as any)(wsUrl) as WebSocketLike);

  let ws: WebSocketLike | null = null;
  let status: RoomConnectionStatus = 'offline';
  let manuallyClosed = false;
  let attempt = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const queue: string[] = [];

  const setStatus = (next: RoomConnectionStatus) => {
    if (status === next) return;
    status = next;
    onStatus(next);
  };

  const clearHeartbeat = () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  };

  const buildEnvelope = (type: string, payload: Record<string, unknown>, roomCode: string | null): string => JSON.stringify({
    v: ROOM_PROTOCOL_VERSION,
    type,
    roomCode,
    clientId,
    ts: Date.now(),
    payload,
  });

  const flushQueue = () => {
    if (!ws || ws.readyState !== WS_OPEN) return;
    while (queue.length > 0) {
      const raw = queue.shift();
      if (raw) ws.send(raw);
    }
  };

  const scheduleReconnect = () => {
    if (manuallyClosed || reconnectTimer) return;
    const delay = reconnectDelayMs(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (manuallyClosed) return;
    setStatus('connecting');
    ws = factory(url);

    ws.onopen = () => {
      attempt = 0;
      setStatus('online');
      flushQueue();
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WS_OPEN) {
          ws.send(buildEnvelope(ROOM_MESSAGE.PRESENCE_PING, {}, null));
        }
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as RoomEnvelope;
        onMessage(parsed);
      } catch {
        // Мусор в канале игнорируем: протокол версионируется, но молча
        // падать из-за чужого кадра не должны.
      }
    };

    ws.onclose = () => {
      clearHeartbeat();
      setStatus('offline');
      if (!manuallyClosed) scheduleReconnect();
    };

    ws.onerror = () => {
      // Закрытие вслед за ошибкой придёт в onclose — там и переподключимся.
    };
  };

  connect();

  return {
    send: (type, payload = {}, roomCode = null) => {
      const raw = buildEnvelope(type, payload, roomCode);
      if (ws && ws.readyState === WS_OPEN) {
        ws.send(raw);
      } else {
        queue.push(raw);
      }
    },
    close: () => {
      manuallyClosed = true;
      clearHeartbeat();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      try { ws?.close(); } catch { /* уже закрыт */ }
      setStatus('offline');
    },
    getStatus: () => status,
  };
};
