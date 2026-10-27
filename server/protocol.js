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
  GM_DIRECTIVE: 'gm.directive',
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
