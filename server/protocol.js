'use strict';

// server/protocol.js
// Константы протокола комнат мастера (план: docs/architecture/gm-rooms-plan.md).
// Клиентское зеркало — src/room/roomProtocol.ts; согласованность наборов
// проверяет __tests__/room/protocol-mirror.test.js. Меняя константу здесь —
// меняй зеркало и бампай PROTOCOL_VERSION при несовместимости.

const PROTOCOL_VERSION = 1;

const MESSAGE = Object.freeze({
  ROOM_CREATE: 'room.create',
  ROOM_CREATED: 'room.created',
  ROOM_JOIN: 'room.join',
  ROOM_STATE: 'room.state',
  ROOM_LEAVE: 'room.leave',
  // Полный список членов комнаты (рассылается на join/leave — presence).
  ROOM_MEMBER: 'room.member',
  PRESENCE_PING: 'presence.ping',
  PRESENCE_PONG: 'presence.pong',
  CHAR_PUBLISH: 'char.publish',
  CHAR_FOCUS: 'char.focus',
  // Патч 528: сломанная заколка списывается КОМАНДОЙ клиенту, а не правкой
  // чужого снимка на сервере. Сначала «спиши предмет штатными средствами»,
  // затем «обнови снимок» (клиент публикует лист обычным char.publish).
  CHAR_SPEND: 'char.spend',
  CHAR_REFRESH: 'char.refresh',
  GM_DIRECTIVE: 'gm.directive',
  GM_DIRECTIVE_ACK: 'gm.directiveAck',
  GM_DIRECTIVE_STATE: 'gm.directiveState',
  PEER_ASSIST: 'peer.assist',
  // Выдача контейнеров добычи и торговли Мастером (патч 468):
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
  // Патч 507: общее хранилище комнаты.
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
});

const ERROR_CODE = Object.freeze({
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
  // Патч 507: общее хранилище.
  STORAGE_BAD_MESSAGE: 'STORAGE_BAD_MESSAGE',
  STORAGE_ENTRY_NOT_FOUND: 'STORAGE_ENTRY_NOT_FOUND',
  STORAGE_FORBIDDEN: 'STORAGE_FORBIDDEN',
  STORAGE_GM_OFFLINE: 'STORAGE_GM_OFFLINE',
  STORAGE_KEY_READ_ONLY: 'STORAGE_KEY_READ_ONLY',
  // Патч 520: мини-игра взлома замков.
  LOCK_NOT_ACTIVE: 'LOCK_NOT_ACTIVE',
  LOCK_ALREADY_ACTIVE: 'LOCK_ALREADY_ACTIVE',
  LOCK_INVALID_ARROW: 'LOCK_INVALID_ARROW',
  LOCK_NO_PINS: 'LOCK_NO_PINS',
  LOCK_VIEW_ONLY: 'LOCK_VIEW_ONLY',
  // Патч 526: будущее условие блокировки замка (политика пока выключена).
  LOCK_BLOCKED: 'LOCK_BLOCKED',
});


const LIMITS = Object.freeze({
  CODE_LENGTH: 6,
  MAX_ROOMS_PER_OWNER: 20,
  MAX_MEMBERS_PER_ROOM: 12,
  MAX_ROOMS_PER_IP_PER_DAY: 200,
  MAX_JOINS_PER_IP_PER_MINUTE: 30,
  MAX_MESSAGE_BYTES: 2 * 1024 * 1024,
  EMPTY_ROOM_TTL_MS: 24 * 60 * 60 * 1000,
});

module.exports = { PROTOCOL_VERSION, MESSAGE, ERROR_CODE, LIMITS };
