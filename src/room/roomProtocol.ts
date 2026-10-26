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
} as const;

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
