// src/room/roomStore.ts
// Стор комнат мастера (zustand, план gm-rooms §3.6): соединение, список
// комнат, presence-члены, входящие/исходящие снапшоты подключённых
// персонажей (char.publish) и запросы create/join с сопоставлением по requestId.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createRoomClient,
  resolveRoomServerUrl,
  type RoomClient,
  type RoomConnectionStatus,
} from './roomClient';
import {
  ROOM_MESSAGE,
  type RoomEnvelope,
  type RoomMember,
  type RoomSnapshotEntry,
} from './roomProtocol';
import { debugLog } from '../debug/falloutDebug';

const CLIENT_ID_STORAGE_KEY = 'room_client_id';
const TAB_SESSION_STORAGE_KEY = 'room_tab_session_id';
const REQUEST_TIMEOUT_MS = 10 * 1000;

export interface RoomStateEntry {
  code: string;
  name: string;
  role: 'gm' | 'player';
  members: RoomMember[];
  joined?: boolean;
  snapshots?: Record<string, RoomSnapshotEntry>;
}

interface CreateRoomResult {
  code: string;
  name: string;
  ownerToken: string;
}

interface JoinRoomResult {
  code: string;
  name: string;
  members: RoomMember[];
  snapshots: RoomSnapshotEntry[];
}

interface RoomStoreState {
  status: RoomConnectionStatus;
  rooms: Record<string, RoomStateEntry>;
  lastError: string | null;
  connect: () => Promise<void>;
  createRoom: (input: {
    name: string;
    prefix?: string;
    requestedCode?: string;
    ownerToken?: string;
  }) => Promise<CreateRoomResult>;
  joinRoom: (input: {
    code: string;
    name: string;
    role?: 'gm' | 'player';
  }) => Promise<JoinRoomResult>;
  leaveRoom: (input: { code: string }) => Promise<void>;
  publishCharacter: (input: {
    code: string;
    characterId: string;
    revision?: number;
    snapshot: unknown;
  }) => Promise<void>;
  unpublishCharacter: (input: {
    code: string;
    characterId: string;
  }) => Promise<void>;
}

// ── Внутреннее состояние соединения (не в стейт-дереве: не для рендера) ──
let client: RoomClient | null = null;
let clientIdPromise: Promise<string> | null = null;
let connectPromise: Promise<void> | null = null;
const pendingRequests = new Map<string, {
  resolve: (message: RoomEnvelope) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();
const joiningCodes = new Set<string>();
const publishListeners = new Set<(message: RoomEnvelope) => void>();

const getWebTabSessionSuffix = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    const storage = window.sessionStorage;
    if (!storage) return '';
    const existing = storage.getItem(TAB_SESSION_STORAGE_KEY);
    if (existing) return `:${existing}`;
    const generated = `t-${Math.random().toString(36).slice(2, 10)}`;
    storage.setItem(TAB_SESSION_STORAGE_KEY, generated);
    return `:${generated}`;
  } catch {
    return '';
  }
};

/**
 * Идентичность подключения (§3.3 + изоляция вкладок 456):
 * базовый uuid хранится в AsyncStorage, а на web дополняется sessionStorage-суффиксом
 * вкладки — чтобы открытые в одном браузере вкладки «Админ» и «Пользователь»
 * не перезаписывали друг друга в списке участников комнаты.
 */
const getRoomClientId = (): Promise<string> => {
  if (!clientIdPromise) {
    clientIdPromise = (async () => {
      const tabSuffix = getWebTabSessionSuffix();
      try {
        const stored = await AsyncStorage.getItem(CLIENT_ID_STORAGE_KEY);
        if (stored) return `${stored}${tabSuffix}`;
        const generated = (globalThis as any).crypto?.randomUUID?.()
          || `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await AsyncStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
        return `${generated}${tabSuffix}`;
      } catch {
        return `c-fallback-${Math.random().toString(36).slice(2)}${tabSuffix}`;
      }
    })();
  }
  return clientIdPromise;
};

const makeRequestId = () => `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const snapshotsArrayToMap = (list: unknown): Record<string, RoomSnapshotEntry> => {
  const map: Record<string, RoomSnapshotEntry> = {};
  if (!Array.isArray(list)) return map;
  for (const raw of list) {
    if (raw && typeof raw === 'object' && typeof (raw as any).characterId === 'string' && (raw as any).snapshot != null) {
      const entry = raw as RoomSnapshotEntry;
      map[entry.characterId] = entry;
    }
  }
  return map;
};

/** Подписка на входящие char.publish. */
export const onRoomCharacterPublish = (listener: (message: RoomEnvelope) => void) => {
  publishListeners.add(listener);
  return () => { publishListeners.delete(listener); };
};

/** Точка подмены клиента для тестов (мок-транспорт вместо настоящего ws). */
let clientFactory: ((input: { url: string; clientId: string; onStatus: any; onMessage: any }) => RoomClient) | null = null;
export const setRoomClientFactoryForTests = (
  factory: typeof clientFactory,
) => { clientFactory = factory; client = null; connectPromise = null; };
export const resetRoomClientForTests = () => {
  if (client) { try { client.close(); } catch { /* мок */ } }
  client = null; connectPromise = null; clientIdPromise = null;
  pendingRequests.forEach(({ timer, reject }) => { clearTimeout(timer); reject(new Error('RESET')); });
  pendingRequests.clear();
};

export const useRoomStore = create<RoomStoreState>((set, get) => {
  const handleMessage = (message: RoomEnvelope) => {
    const requestId = message?.payload?.requestId;
    if (message.type === ROOM_MESSAGE.ERROR) {
      if (requestId && pendingRequests.has(requestId)) {
        const pending = pendingRequests.get(requestId)!;
        pendingRequests.delete(requestId);
        clearTimeout(pending.timer);
        pending.reject(new Error(message.payload.code || 'ROOM_ERROR'));
        return;
      }
      set({ lastError: message?.payload?.code || 'ROOM_ERROR' });
      return;
    }
    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId)!;
      pendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(message);
      return;
    }
    switch (message.type) {
      case ROOM_MESSAGE.ROOM_MEMBER: {
        const code = message.roomCode;
        if (!code) return;
        const current = get().rooms[code];
        if (!current) return;
        set({
          rooms: {
            ...get().rooms,
            [code]: { ...current, members: message.payload?.members || [] },
          },
        });
        return;
      }
      case ROOM_MESSAGE.CHAR_PUBLISH: {
        const code = message.roomCode;
        const charId = message.payload?.characterId;
        if (code && typeof charId === 'string') {
          const current = get().rooms[code];
          if (current) {
            const nextSnapshots = { ...(current.snapshots || {}) };
            if (message.payload?.removed || message.payload?.snapshot == null) {
              delete nextSnapshots[charId];
            } else {
              const incomingRev = Number(message.payload?.revision) || 0;
              const prevRev = Number(nextSnapshots[charId]?.revision) || 0;
              if (!nextSnapshots[charId] || incomingRev >= prevRev) {
                nextSnapshots[charId] = {
                  characterId: charId,
                  revision: incomingRev,
                  snapshot: message.payload.snapshot,
                  fromClientId: message.payload?.fromClientId || message.clientId || '',
                  fromName: message.payload?.fromName,
                };
              }
            }
            set({
              rooms: {
                ...get().rooms,
                [code]: { ...current, snapshots: nextSnapshots },
              },
            });
          }
        }
        publishListeners.forEach((listener) => {
          try { listener(message); } catch (error) {
            debugLog('room.publishListener:failed', { message: (error as Error)?.message });
          }
        });
        return;
      }
      default:
    }
  };

  const ensureClient = async (): Promise<RoomClient> => {
    const url = resolveRoomServerUrl();
    if (!url) throw new Error('ROOM_SERVER_NOT_CONFIGURED');
    if (client) return client;
    const clientId = await getRoomClientId();
    const factory = clientFactory || ((input: any) => createRoomClient({
      url: input.url,
      clientId: input.clientId,
      onStatus: input.onStatus,
      onMessage: input.onMessage,
    }));
    client = factory({
      url,
      clientId,
      onStatus: (status: RoomConnectionStatus) => {
        if (status === 'offline') {
          const currentRooms = get().rooms;
          const codes = Object.keys(currentRooms);
          if (codes.length > 0) {
            const nextRooms: Record<string, RoomStateEntry> = {};
            for (const roomCode of codes) {
              nextRooms[roomCode] = { ...currentRooms[roomCode], joined: false, members: [] };
            }
            set({ status, rooms: nextRooms });
            return;
          }
        }
        set({ status });
      },
      onMessage: handleMessage,
    });
    return client;
  };

  const sendRequest = (type: string, payload: Record<string, unknown>, roomCode: string | null): Promise<RoomEnvelope> => (
    new Promise((resolve, reject) => {
      const requestId = makeRequestId();
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('ROOM_TIMEOUT'));
      }, REQUEST_TIMEOUT_MS);
      pendingRequests.set(requestId, { resolve, reject, timer });
      ensureClient()
        .then((readyClient) => readyClient.send(type, { ...payload, requestId }, roomCode))
        .catch((error) => {
          pendingRequests.delete(requestId);
          clearTimeout(timer);
          reject(error);
        });
    })
  );

  return {
    status: 'offline',
    rooms: {},
    lastError: null,

    connect: async () => {
      if (!connectPromise) {
        connectPromise = ensureClient().then(() => undefined);
      }
      return connectPromise;
    },

    createRoom: async ({ name, prefix, requestedCode, ownerToken }) => {
      const payload: Record<string, unknown> = { name, prefix };
      if (requestedCode) payload.requestedCode = requestedCode;
      if (ownerToken) payload.ownerToken = ownerToken;
      const response = await sendRequest(ROOM_MESSAGE.ROOM_CREATE, payload, null);
      const { code, ownerToken: issuedToken, name: roomName } = response.payload;
      const prev = get().rooms[code];
      set({
        rooms: {
          ...get().rooms,
          [code]: {
            code,
            name: roomName || name,
            role: 'gm',
            members: prev?.members || [],
            joined: false,
            snapshots: prev?.snapshots || {},
          },
        },
      });
      debugLog('room.create:ok', { code });
      return { code, name: roomName || name, ownerToken: issuedToken };
    },

    joinRoom: async ({ code, name, role = 'player' }) => {
      const existing = get().rooms[code];
      if (existing && existing.joined !== false && existing.role === role) {
        return {
          code,
          name: existing.name,
          members: existing.members,
          snapshots: Object.values(existing.snapshots || {}),
        };
      }
      if (joiningCodes.has(code)) throw new Error('ROOM_JOIN_IN_PROGRESS');
      joiningCodes.add(code);
      try {
        const response = await sendRequest(ROOM_MESSAGE.ROOM_JOIN, { code, name, role }, code);
        const payloadRooms = response.payload;
        const snapshotsMap = snapshotsArrayToMap(payloadRooms.snapshots);
        set({
          rooms: {
            ...get().rooms,
            [code]: {
              code,
              name: payloadRooms.name || code,
              role,
              members: payloadRooms.members || [],
              joined: true,
              snapshots: snapshotsMap,
            },
          },
        });
        debugLog('room.join:ok', { code, role });
        return {
          code,
          name: payloadRooms.name || code,
          members: payloadRooms.members || [],
          snapshots: Object.values(snapshotsMap),
        };
      } finally {
        joiningCodes.delete(code);
      }
    },

    leaveRoom: async ({ code }) => {
      try {
        const readyClient = await ensureClient();
        readyClient.send(ROOM_MESSAGE.ROOM_LEAVE, {}, code);
      } catch (error) {
        debugLog('room.leave:sendFailed', { message: (error as Error)?.message });
      }
      const rest = { ...get().rooms };
      delete rest[code];
      set({ rooms: rest });
    },

    publishCharacter: async ({ code, characterId, revision, snapshot }) => {
      const rev = Number.isFinite(revision) ? Number(revision) : Date.now();
      const readyClient = await ensureClient();
      readyClient.send(
        ROOM_MESSAGE.CHAR_PUBLISH,
        { characterId, revision: rev, snapshot },
        code,
      );
      const current = get().rooms[code];
      if (current) {
        set({
          rooms: {
            ...get().rooms,
            [code]: {
              ...current,
              snapshots: {
                ...(current.snapshots || {}),
                [characterId]: {
                  characterId,
                  revision: rev,
                  snapshot,
                  fromClientId: 'self',
                },
              },
            },
          },
        });
      }
    },

    unpublishCharacter: async ({ code, characterId }) => {
      try {
        const readyClient = await ensureClient();
        readyClient.send(
          ROOM_MESSAGE.CHAR_PUBLISH,
          { characterId, revision: Date.now(), snapshot: null, removed: true },
          code,
        );
      } catch (error) {
        debugLog('room.unpublish:sendFailed', { message: (error as Error)?.message });
      }
      const current = get().rooms[code];
      if (current?.snapshots?.[characterId]) {
        const nextSnapshots = { ...current.snapshots };
        delete nextSnapshots[characterId];
        set({
          rooms: {
            ...get().rooms,
            [code]: { ...current, snapshots: nextSnapshots },
          },
        });
      }
    },
  };
});

export default useRoomStore;

export const selectRoomStatus = (state: RoomStoreState) => state.status;
export const selectRooms = (state: RoomStoreState) => state.rooms;
