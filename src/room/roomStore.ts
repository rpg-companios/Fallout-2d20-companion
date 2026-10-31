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
  type ActiveLootTradeSession,
  type RoomDirectiveEntry,
  type RoomEnvelope,
  type RoomMember,
  type RoomSnapshotEntry,
} from './roomProtocol';
import { debugLog } from '../debug/falloutDebug';
import { assertAdminFeature, FEATURE_IDS } from '../../domain/premium';

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
  activeSession?: ActiveLootTradeSession | null;
  directives?: RoomDirectiveEntry[];
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
  activeSession?: ActiveLootTradeSession | null;
  directives?: RoomDirectiveEntry[];
}

interface RoomStoreState {
  status: RoomConnectionStatus;
  clientId: string | null;
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
    ownerToken?: string;
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
  openRoomSession: (input: {
    code: string;
    session: Record<string, unknown>;
    ownerToken?: string;
  }) => Promise<ActiveLootTradeSession>;
  updateRoomSessionRates: (input: {
    code: string;
    ownerToken?: string;
    sessionId?: string;
    targetCharacterId?: string | null;
    resetCharacterOverride?: boolean;
    resetAllCharacterOverrides?: boolean;
    saleMarkupPercent?: number;
    buyDepreciationPercent?: number;
    caps?: number;
    items?: unknown[];
    name?: string;
    description?: string;
    nodes?: unknown[];
    nodeContainerId?: string | null;
    nodeName?: string;
    nodeDescription?: string;
    nodeItems?: unknown[];
    locked?: boolean;
    lockLabel?: string;
  }) => Promise<ActiveLootTradeSession>;
  closeRoomSession: (input: {
    code: string;
    sessionId?: string | null;
    ownerToken?: string;
  }) => Promise<void>;
  playerCloseRoomSession: (input: {
    code: string;
    sessionId?: string | null;
  }) => Promise<{
    session: ActiveLootTradeSession | null;
    closedReason?: string | null;
  }>;
  takeFromLootSession: (input: {
    code: string;
    sessionId: string;
    characterId: string;
    takes: Array<{ entryId: string; quantity: number }>;
    nodeContainerId?: string | null;
  }) => Promise<{
    granted: any[];
    session: ActiveLootTradeSession | null;
    closedReason?: string | null;
  }>;
  commitMerchantTrade: (input: {
    code: string;
    sessionId: string;
    characterId: string;
    perkCapCollectorPercent?: number;
    playerCapsAvailable: number;
    acceptCapShortfall?: boolean;
    buyItems: Array<{ entryId: string; quantity: number }>;
    sellItems: Array<Record<string, unknown>>;
    nodeContainerId?: string | null;
  }) => Promise<{ committed: any; session: ActiveLootTradeSession }>;
  sendGmDirective: (input: {
    code: string;
    ownerToken?: string;
    directiveId?: string;
    kind: string;
    amount?: number;
    mode?: string | null;
    note?: string;
    targetType?: 'room' | 'character';
    targetCharacterId?: string | null;
    targetCharacterIds?: string[];
    envPayload?: Record<string, unknown> | null;
  }) => Promise<{
    directive: RoomDirectiveEntry;
    directives: RoomDirectiveEntry[];
  }>;
  sendPeerAssist: (input: {
    code: string;
    directiveId?: string;
    targetCharacterId: string;
    fromCharacterName?: string;
    note?: string;
    envPayload: Record<string, unknown>;
  }) => Promise<{
    directive: RoomDirectiveEntry;
    directives: RoomDirectiveEntry[];
  }>;
  ackGmDirective: (input: {
    code: string;
    directiveId: string;
    characterId: string;
  }) => Promise<{
    directive: RoomDirectiveEntry | null;
    directives: RoomDirectiveEntry[];
  }>;
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
const sessionListeners = new Set<(message: RoomEnvelope) => void>();
const directiveListeners = new Set<(message: RoomEnvelope) => void>();

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

/** Подписка на обновления выданной добычи / торговли (session.state). */
export const onRoomSessionState = (listener: (message: RoomEnvelope) => void) => {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
};

/** Подписка на входящие команды Мастера и их статусы доставки (gm.directive / gm.directiveState). */
export const onRoomDirective = (listener: (message: RoomEnvelope) => void) => {
  directiveListeners.add(listener);
  return () => { directiveListeners.delete(listener); };
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
  try { useRoomStore.setState({ clientId: null }); } catch { /* до инициализации */ }
};

export const useRoomStore = create<RoomStoreState>((set, get) => {
  const applySessionEnvelopeToStore = (message: RoomEnvelope) => {
    const code = message.roomCode;
    if (!code || !message.payload || !('session' in message.payload)) return;
    const current = get().rooms[code];
    if (current) {
      set({
        rooms: {
          ...get().rooms,
          [code]: {
            ...current,
            activeSession: (message.payload.session as ActiveLootTradeSession | null) ?? null,
          },
        },
      });
    }
    sessionListeners.forEach((listener) => {
      try { listener(message); } catch (error) {
        debugLog('room.sessionListener:failed', { message: (error as Error)?.message });
      }
    });
  };

  const applyDirectiveEnvelopeToStore = (message: RoomEnvelope) => {
    const code = message.roomCode;
    if (!code || !message.payload) return;
    const current = get().rooms[code];
    if (current) {
      let nextDirectives = Array.isArray(current.directives) ? [...current.directives] : [];
      if (Array.isArray(message.payload.directives)) {
        nextDirectives = message.payload.directives as RoomDirectiveEntry[];
      } else if (message.payload.directiveId) {
        const incoming = message.payload as RoomDirectiveEntry;
        const idx = nextDirectives.findIndex((d) => d.directiveId === incoming.directiveId);
        if (idx >= 0) nextDirectives[idx] = incoming;
        else nextDirectives.push(incoming);
      }
      set({
        rooms: {
          ...get().rooms,
          [code]: {
            ...current,
            directives: nextDirectives,
          },
        },
      });
    }
    directiveListeners.forEach((listener) => {
      try { listener(message); } catch (error) {
        debugLog('room.directiveListener:failed', { message: (error as Error)?.message });
      }
    });
  };

  const handleMessage = (message: RoomEnvelope) => {
    const requestId = message?.payload?.requestId;
    if (message.type === ROOM_MESSAGE.ERROR) {
      if (message?.payload && 'session' in message.payload && message.payload.session !== undefined) {
        applySessionEnvelopeToStore(message);
      }
      if (requestId && pendingRequests.has(requestId)) {
        const pending = pendingRequests.get(requestId)!;
        pendingRequests.delete(requestId);
        clearTimeout(pending.timer);
        const err = new Error(message.payload.code || 'ROOM_ERROR') as Error & {
          code?: string;
          payload?: any;
        };
        err.code = message.payload.code || 'ROOM_ERROR';
        err.payload = message.payload;
        pending.reject(err);
        return;
      }
      set({ lastError: message?.payload?.code || 'ROOM_ERROR' });
      return;
    }
    if (
      message.type === ROOM_MESSAGE.SESSION_STATE
      || message.type === ROOM_MESSAGE.SESSION_LOOT_TAKE
      || message.type === ROOM_MESSAGE.SESSION_TRADE_COMMIT
    ) {
      applySessionEnvelopeToStore(message);
    }
    if (
      message.type === ROOM_MESSAGE.GM_DIRECTIVE
      || message.type === ROOM_MESSAGE.GM_DIRECTIVE_STATE
    ) {
      applyDirectiveEnvelopeToStore(message);
    }
    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId)!;
      pendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(message);
      return;
    }
    switch (message.type) {
      case ROOM_MESSAGE.SESSION_STATE: {
        // Уже обработано выше через applySessionEnvelopeToStore.
        return;
      }
      case ROOM_MESSAGE.ROOM_MEMBER: {
        const code = message.roomCode;
        if (!code) return;
        const current = get().rooms[code];
        if (!current) return;
        set({
          rooms: {
            ...get().rooms,
            [code]: {
              ...current,
              name: typeof message.payload?.name === 'string' && message.payload.name.trim()
                ? message.payload.name.trim()
                : current.name,
              members: message.payload?.members || [],
            },
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
    if (get().clientId !== clientId) {
      set({ clientId });
    }
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
    clientId: null,
    rooms: {},
    lastError: null,

    connect: async () => {
      if (!connectPromise) {
        connectPromise = ensureClient().then(() => undefined);
      }
      return connectPromise;
    },

    createRoom: async ({ name, prefix, requestedCode, ownerToken }) => {
      assertAdminFeature(FEATURE_IDS.GM_CAMPAIGNS);
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
            joined: Boolean(prev?.joined && requestedCode),
            snapshots: prev?.snapshots || {},
            activeSession: prev?.activeSession ?? null,
            directives: prev?.directives || [],
          },
        },
      });
      debugLog('room.create:ok', { code });
      return { code, name: roomName || name, ownerToken: issuedToken };
    },

    joinRoom: async ({ code, name, role = 'player', ownerToken }) => {
      if (role === 'gm') {
        assertAdminFeature(FEATURE_IDS.GM_CAMPAIGNS);
      }
      const existing = get().rooms[code];
      if (existing && existing.joined !== false && existing.role === role) {
        return {
          code,
          name: existing.name,
          members: existing.members,
          snapshots: Object.values(existing.snapshots || {}),
          activeSession: existing.activeSession ?? null,
          directives: existing.directives || [],
        };
      }
      if (joiningCodes.has(code)) throw new Error('ROOM_JOIN_IN_PROGRESS');
      joiningCodes.add(code);
      try {
        const joinPayload: Record<string, unknown> = { code, name, role };
        if (ownerToken) joinPayload.ownerToken = ownerToken;
        const response = await sendRequest(ROOM_MESSAGE.ROOM_JOIN, joinPayload, code);
        const payloadRooms = response.payload;
        const snapshotsMap = snapshotsArrayToMap(payloadRooms.snapshots);
        const activeSession = (payloadRooms.activeSession as ActiveLootTradeSession | null) ?? null;
        const directives = Array.isArray(payloadRooms.directives)
          ? (payloadRooms.directives as RoomDirectiveEntry[])
          : [];
        const lastClosedEntry = payloadRooms.lastClosedSession as {
          session?: ActiveLootTradeSession | null;
          closedReason?: string | null;
        } | null | undefined;
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
              activeSession,
              directives,
            },
          },
        });
        if (directives.length > 0) {
          const directiveEnvelope: RoomEnvelope = {
            v: 1,
            type: ROOM_MESSAGE.GM_DIRECTIVE_STATE,
            roomCode: code,
            clientId: get().clientId || '',
            ts: Date.now(),
            payload: { directives },
          };
          directiveListeners.forEach((listener) => {
            try { listener(directiveEnvelope); } catch (error) {
              debugLog('room.directiveListener:failed', { message: (error as Error)?.message });
            }
          });
        }
        if (activeSession || lastClosedEntry?.session) {
          const syntheticEnvelope: RoomEnvelope = {
            v: 1,
            type: ROOM_MESSAGE.SESSION_STATE,
            roomCode: code,
            clientId: get().clientId || '',
            ts: Date.now(),
            payload: {
              session: activeSession,
              ...(activeSession ? {} : {
                closedSession: lastClosedEntry?.session ?? null,
                closedReason: lastClosedEntry?.closedReason ?? null,
              }),
            },
          };
          sessionListeners.forEach((listener) => {
            try { listener(syntheticEnvelope); } catch (error) {
              debugLog('room.sessionListener:failed', { message: (error as Error)?.message });
            }
          });
        }
        debugLog('room.join:ok', { code, role });
        return {
          code,
          name: payloadRooms.name || code,
          members: payloadRooms.members || [],
          snapshots: Object.values(snapshotsMap),
          activeSession,
          directives,
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

    openRoomSession: async ({ code, session, ownerToken }) => {
      assertAdminFeature(FEATURE_IDS.GM_LOOT_TRADE);
      const reqPayload: Record<string, unknown> = { code, session };
      if (ownerToken) reqPayload.ownerToken = ownerToken;
      const response = await sendRequest(
        ROOM_MESSAGE.SESSION_OPEN,
        reqPayload,
        code,
      );
      return response.payload?.session as ActiveLootTradeSession;
    },

    updateRoomSessionRates: async ({ code, ownerToken, ...rest }) => {
      assertAdminFeature(FEATURE_IDS.GM_LOOT_TRADE);
      const reqPayload: Record<string, unknown> = { code, ...rest };
      if (ownerToken) reqPayload.ownerToken = ownerToken;
      const response = await sendRequest(
        ROOM_MESSAGE.SESSION_UPDATE_RATES,
        reqPayload,
        code,
      );
      return response.payload?.session as ActiveLootTradeSession;
    },

    closeRoomSession: async ({ code, sessionId = null, ownerToken }) => {
      assertAdminFeature(FEATURE_IDS.GM_LOOT_TRADE);
      const reqPayload: Record<string, unknown> = { code, sessionId };
      if (ownerToken) reqPayload.ownerToken = ownerToken;
      await sendRequest(
        ROOM_MESSAGE.SESSION_CLOSE,
        reqPayload,
        code,
      );
    },

    playerCloseRoomSession: async ({ code, sessionId = null }) => {
      try {
        const response = await sendRequest(
          ROOM_MESSAGE.SESSION_PLAYER_CLOSE,
          { code, sessionId },
          code,
        );
        return {
          session: (response.payload?.session as ActiveLootTradeSession | null) ?? null,
          closedReason: response.payload?.closedReason || null,
        };
      } catch (error) {
        const errCode = (error as any)?.code || (error as Error)?.message;
        if (errCode === 'UNKNOWN_TYPE') {
          const current = get().rooms[code];
          if (current && (!sessionId || current.activeSession?.sessionId === sessionId)) {
            set({
              rooms: {
                ...get().rooms,
                [code]: { ...current, activeSession: null },
              },
            });
          }
          return { session: null, closedReason: null };
        }
        throw error;
      }
    },

    takeFromLootSession: async ({ code, sessionId, characterId, takes, nodeContainerId = null }) => {
      const response = await sendRequest(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          code,
          sessionId,
          characterId,
          takes,
          ...(nodeContainerId ? { nodeContainerId } : {}),
        },
        code,
      );
      return {
        granted: response.payload?.granted || [],
        session: (response.payload?.session as ActiveLootTradeSession | null) ?? null,
        closedReason: response.payload?.closedReason || null,
      };
    },

    commitMerchantTrade: async ({
      code,
      sessionId,
      characterId,
      perkCapCollectorPercent = 0,
      playerCapsAvailable,
      acceptCapShortfall = false,
      buyItems,
      sellItems,
      nodeContainerId = null,
    }) => {
      const response = await sendRequest(
        ROOM_MESSAGE.SESSION_TRADE_COMMIT,
        {
          code,
          sessionId,
          characterId,
          perkCapCollectorPercent,
          playerCapsAvailable,
          acceptCapShortfall,
          buyItems,
          sellItems,
          ...(nodeContainerId ? { nodeContainerId } : {}),
        },
        code,
      );
      return {
        committed: response.payload?.committed,
        session: response.payload?.session as ActiveLootTradeSession,
      };
    },

    sendGmDirective: async ({
      code,
      ownerToken,
      directiveId,
      kind,
      amount = 1,
      mode = null,
      note = '',
      targetType = 'room',
      targetCharacterId = null,
      targetCharacterIds,
      envPayload = null,
    }) => {
      assertAdminFeature(FEATURE_IDS.ADMIN_ACCESS);
      const response = await sendRequest(
        ROOM_MESSAGE.GM_DIRECTIVE,
        {
          code,
          kind,
          amount,
          ...(mode ? { mode } : {}),
          ...(note ? { note } : {}),
          targetType,
          ...(targetCharacterId ? { targetCharacterId } : {}),
          ...(Array.isArray(targetCharacterIds) ? { targetCharacterIds } : {}),
          ...(envPayload ? { envPayload } : {}),
          ...(directiveId ? { directiveId } : {}),
          ...(ownerToken ? { ownerToken } : {}),
        },
        code,
      );
      return {
        directive: response.payload?.directive as RoomDirectiveEntry,
        directives: (response.payload?.directives || []) as RoomDirectiveEntry[],
      };
    },

    sendPeerAssist: async ({
      code,
      directiveId,
      targetCharacterId,
      fromCharacterName = '',
      note = '',
      envPayload,
    }) => {
      const response = await sendRequest(
        ROOM_MESSAGE.PEER_ASSIST,
        {
          code,
          targetCharacterId,
          ...(fromCharacterName ? { fromCharacterName } : {}),
          ...(note ? { note } : {}),
          envPayload,
          ...(directiveId ? { directiveId } : {}),
        },
        code,
      );
      return {
        directive: response.payload?.directive as RoomDirectiveEntry,
        directives: (response.payload?.directives || []) as RoomDirectiveEntry[],
      };
    },

    ackGmDirective: async ({ code, directiveId, characterId }) => {
      const response = await sendRequest(
        ROOM_MESSAGE.GM_DIRECTIVE_ACK,
        {
          code,
          directiveId,
          characterId,
        },
        code,
      );
      return {
        directive: (response.payload?.directive || null) as RoomDirectiveEntry | null,
        directives: (response.payload?.directives || []) as RoomDirectiveEntry[],
      };
    },
  };
});

export default useRoomStore;

export const selectRoomStatus = (state: RoomStoreState) => state.status;
export const selectRooms = (state: RoomStoreState) => state.rooms;
