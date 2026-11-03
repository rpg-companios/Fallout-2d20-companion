// src/room/roomProtocol.ts
// Клиентское зеркало протокола комнат (серверное — server/protocol.js,
// план gm-rooms §3.4). Конверт: { v, type, roomCode, clientId, ts, payload };
// requestId внутри payload эхом возвращается сервером в ответах
// room.created / room.state / error — клиент сопоставляет ответ с запросом.

export const ROOM_PROTOCOL_VERSION = 1;

export const ROOM_MESSAGE = {
  ROOM_CREATE: 'room.create',
  ROOM_CREATED: 'room.created',
  ROOM_JOIN: 'room.join',
  ROOM_STATE: 'room.state',
  ROOM_LEAVE: 'room.leave',
  ROOM_MEMBER: 'room.member',
  PRESENCE_PING: 'presence.ping',
  PRESENCE_PONG: 'presence.pong',
  CHAR_PUBLISH: 'char.publish',
  CHAR_FOCUS: 'char.focus',
  GM_DIRECTIVE: 'gm.directive',
  GM_DIRECTIVE_ACK: 'gm.directiveAck',
  GM_DIRECTIVE_STATE: 'gm.directiveState',
  PEER_ASSIST: 'peer.assist',
  SESSION_OPEN: 'session.open',
  SESSION_STATE: 'session.state',
  SESSION_UPDATE_RATES: 'session.updateRates',
  SESSION_CLOSE: 'session.close',
  SESSION_PLAYER_CLOSE: 'session.playerClose',
  SESSION_LOOT_TAKE: 'session.lootTake',
  SESSION_TRADE_COMMIT: 'session.tradeCommit',
  TERMINAL_ISSUE: 'terminal.issue',
  TERMINAL_ACTION: 'terminal.action',
  TERMINAL_STATE: 'terminal.state',
  STORAGE_STATE: 'storage.state',
  STORAGE_DEPOSIT: 'storage.deposit',
  STORAGE_WITHDRAW: 'storage.withdraw',
  STORAGE_RESTORE: 'storage.restore',
  STORAGE_ADD_KEY: 'storage.addKey',
  // Патч 518: атомарный перенос по кнопке «Перенести» в двухпанельном складе.
  STORAGE_TRANSFER: 'storage.transfer',
  // Патч 517: общие на комнату события доступа (ворота).
  ACCESS_STATE: 'access.state',
  ERROR: 'error',
} as const;

export const ROOM_ERROR = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_QUOTA_EXCEEDED: 'ROOM_QUOTA_EXCEEDED',
  ROOM_CODE_TAKEN: 'ROOM_CODE_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_ROOM_OWNER: 'NOT_ROOM_OWNER',
  BAD_MESSAGE: 'BAD_MESSAGE',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  SESSION_NOT_ACTIVE: 'SESSION_NOT_ACTIVE',
  SESSION_FORBIDDEN: 'SESSION_FORBIDDEN',
  CONTAINER_LOCKED: 'CONTAINER_LOCKED',
  // Патч 516: точка требует ключевую запись, которой нет на складе.
  KEY_REQUIRED: 'KEY_REQUIRED',
  TRADE_STOCK_CHANGED: 'TRADE_STOCK_CHANGED',
  TRADE_NOT_ENOUGH_PLAYER_CAPS: 'TRADE_NOT_ENOUGH_PLAYER_CAPS',
  TRADE_NOT_ENOUGH_MERCHANT_CAPS: 'TRADE_NOT_ENOUGH_MERCHANT_CAPS',
  TERMINAL_NOT_ISSUED: 'TERMINAL_NOT_ISSUED',
  TERMINAL_LOCKED: 'TERMINAL_LOCKED',
  // Патч 504: решение Мастера вместо автоматической блокировки.
  TERMINAL_CLOSED: 'TERMINAL_CLOSED',
  TERMINAL_AWAITING_RETRY: 'TERMINAL_AWAITING_RETRY',
  TERMINAL_VIEW_ONLY: 'TERMINAL_VIEW_ONLY',
  TERMINAL_ALREADY_ACTIVE: 'TERMINAL_ALREADY_ACTIVE',
  TERMINAL_NOT_ACTIVE: 'TERMINAL_NOT_ACTIVE',
  TERMINAL_INVALID_GUESS: 'TERMINAL_INVALID_GUESS',
  TERMINAL_INVALID_BRACKET: 'TERMINAL_INVALID_BRACKET',
  TERMINAL_DIGEST_UNAVAILABLE: 'TERMINAL_DIGEST_UNAVAILABLE',
  TERMINAL_DIGEST_DECISION_REQUIRED: 'TERMINAL_DIGEST_DECISION_REQUIRED',
  TERMINAL_GM_ONLY: 'TERMINAL_GM_ONLY',
  STORAGE_BAD_MESSAGE: 'STORAGE_BAD_MESSAGE',
  STORAGE_ENTRY_NOT_FOUND: 'STORAGE_ENTRY_NOT_FOUND',
  STORAGE_FORBIDDEN: 'STORAGE_FORBIDDEN',
  STORAGE_GM_OFFLINE: 'STORAGE_GM_OFFLINE',
  STORAGE_KEY_READ_ONLY: 'STORAGE_KEY_READ_ONLY',
} as const;

export interface ActiveLootTradeItem {
  entryId: string;
  itemId: string;
  itemType: string;
  name: string;
  cost: number;
  weight: number;
  quantity: number;
  markupPercent: number;
  itemSnapshot?: Record<string, unknown> | null;
}

export interface ActiveHubChildNode {
  containerId: string;
  kind: 'loot' | 'merchant';
  name: string;
  description: string;
  locked: boolean;
  lockLabel: string;
  hasItemsHint?: boolean;
  caps: number;
  saleMarkupPercent: number;
  buyDepreciationPercent: number;
  characterOverrides: Record<string, {
    saleMarkupPercent?: number;
    buyDepreciationPercent?: number;
  }>;
  items: ActiveLootTradeItem[];
}

export interface ActiveLootTradeSession {
  sessionId: string;
  containerId: string;
  kind: 'loot' | 'merchant' | 'hub';
  name: string;
  description: string;
  targetType: 'room' | 'character';
  targetCharacterId: string | null;
  targetCharacterName?: string | null;
  caps: number;
  saleMarkupPercent: number;
  buyDepreciationPercent: number;
  characterOverrides: Record<string, {
    saleMarkupPercent?: number;
    buyDepreciationPercent?: number;
  }>;
  items: ActiveLootTradeItem[];
  nodes?: ActiveHubChildNode[];
  closedByClientIds?: string[];
  revision: number;
  openedAt: number;
  updatedAt: number;
}

export interface RoomEnvelope {
  v: number;
  type: string;
  roomCode: string | null;
  clientId: string | null;
  ts: number;
  payload: any;
}

export type RoomRole = 'gm' | 'player';

export interface RoomMember {
  clientId: string;
  name: string;
  role: RoomRole;
}

export interface RoomSnapshotEntry {
  characterId: string;
  revision: number;
  snapshot: unknown;
  fromClientId: string;
  fromName?: string;
}

export interface RoomDirectiveEntry {
  directiveId: string;
  kind: string;
  originRole?: 'gm' | 'peer';
  amount: number;
  mode?: string | null;
  note: string;
  targetType: 'room' | 'character';
  targetCharacterId: string | null;
  targetCharacterIds: string[];
  ackedByCharacterIds: string[];
  fromClientId?: string;
  fromName?: string;
  envPayload?: Record<string, unknown> | null;
  createdAt: number;
}

