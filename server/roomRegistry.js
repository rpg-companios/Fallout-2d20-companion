'use strict';

// server/roomRegistry.js
// Реестр комнат мастера: чистая память + правила, БЕЗ сети (сеть —
// roomServer.js). Хранит членов комнаты, последние снапшоты персонажей,
// квоты и TTL. Членская запись несёт непрозрачный `ws` (кладёт сетевой
// слой, реестр его никогда не трогает) — так тесты подставляют заглушки.

const crypto = require('node:crypto');
const { ERROR_CODE, LIMITS } = require('./protocol');
const { generateRoomCode, sanitizePrefix } = require('./roomCode');

const newOwnerToken = () => crypto.randomBytes(16).toString('hex');

/**
 * @param {{ now?: () => number, rng?: (max: number) => number, limits?: object }} deps
 * now/rng — точки подмены для тестов (TTL, коллизии кодов).
 */
const createRoomRegistry = ({ now = () => Date.now(), rng = undefined, limits = LIMITS } = {}) => {
  const rooms = new Map(); // code -> room
  const ipRoomLog = new Map(); // ip -> [ts] (создания комнат за сутки)
  const ipJoinLog = new Map(); // ip -> [ts] (входы за минуту)
  const lastRng = rng; // jest/vitest подмена

  const touchRateLog = (log, key, windowMs, max) => {
    const cutoff = now() - windowMs;
    const list = (log.get(key) || []).filter((ts) => ts > cutoff);
    if (list.length >= max) return false;
    list.push(now());
    log.set(key, list);
    return true;
  };

  const buildRoom = ({ code, ownerClientId, ownerToken, name }) => ({
    code,
    name: String(name || '').trim() || code,
    ownerClientId: ownerClientId || null,
    ownerToken,
    members: new Map(), // clientId -> { clientId, name, role, ws }
    lastSnapshots: new Map(), // characterId -> { characterId, revision, snapshot, fromClientId, fromName, updatedAt }
    createdAt: now(),
    emptySince: null,
  });

  const roomSnapshot = (room) => ({
    code: room.code,
    name: room.name,
    members: [...room.members.values()].map((member) => ({
      clientId: member.clientId, name: member.name, role: member.role,
    })),
    snapshots: [...room.lastSnapshots.values()].map((entry) => ({
      characterId: entry.characterId,
      revision: entry.revision,
      snapshot: entry.snapshot,
      fromClientId: entry.fromClientId,
      fromName: entry.fromName,
    })),
  });

  const countOwnedRooms = (ownerClientId) => (
    [...rooms.values()].filter((room) => room.ownerClientId === ownerClientId).length
  );

  const generateFreeCode = (prefixRaw) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const prefix = sanitizePrefix(prefixRaw);
      const candidate = `${prefix}-${generateRoomCode(limits.CODE_LENGTH, lastRng)}`;
      if (!rooms.has(candidate)) return candidate;
    }
    return null;
  };

  /**
   * Создать комнату. requestedCode + ownerToken — восстановление комнаты
   * мастера (перезапуск сервера / переезд): код занят чужой комнатой без
   * совпадения токена → ROOM_CODE_TAKEN.
   */
  const createRoom = ({ clientId, ip = 'unknown', prefix, requestedCode = null, ownerToken = null, name = '' }) => {
    if (requestedCode) {
      const existing = rooms.get(requestedCode);
      if (existing) {
        if (!ownerToken || existing.ownerToken !== ownerToken) {
          return { error: ERROR_CODE.ROOM_CODE_TAKEN };
        }
        existing.ownerClientId = clientId;
        if (name) existing.name = String(name).trim() || existing.name;
        existing.emptySince = null;
        return { room: existing, rebound: true };
      }
      const room = buildRoom({
        code: requestedCode,
        ownerClientId: clientId,
        ownerToken: ownerToken || newOwnerToken(),
        name,
      });
      rooms.set(room.code, room);
      return { room, rebound: false };
    }

    if (!touchRateLog(ipRoomLog, ip || 'unknown', 24 * 60 * 60 * 1000, limits.MAX_ROOMS_PER_IP_PER_DAY)) {
      return { error: ERROR_CODE.ROOM_QUOTA_EXCEEDED };
    }
    if (countOwnedRooms(clientId) >= limits.MAX_ROOMS_PER_OWNER) {
      return { error: ERROR_CODE.ROOM_QUOTA_EXCEEDED };
    }
    const code = generateFreeCode(prefix);
    if (!code) return { error: ERROR_CODE.ROOM_QUOTA_EXCEEDED };
    const room = buildRoom({ code, ownerClientId: clientId, ownerToken: newOwnerToken(), name });
    rooms.set(code, room);
    return { room, rebound: false };
  };

  const joinRoom = ({ code, clientId, ip = 'unknown', name = '', role = 'player', ws = null }) => {
    if (!touchRateLog(ipJoinLog, ip || 'unknown', 60 * 1000, limits.MAX_JOINS_PER_IP_PER_MINUTE)) {
      return { error: ERROR_CODE.RATE_LIMITED };
    }
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (!room.members.has(clientId) && room.members.size >= limits.MAX_MEMBERS_PER_ROOM) {
      return { error: ERROR_CODE.ROOM_FULL };
    }
    // Повторный вход того же clientId — переподключение: запись заменяется.
    room.members.set(clientId, {
      clientId,
      name: String(name || '').trim() || '—',
      role: role === 'gm' ? 'gm' : 'player',
      ws,
    });
    room.emptySince = null;
    return { room, state: roomSnapshot(room) };
  };

  const leaveRoom = ({ code, clientId }) => {
    const room = rooms.get(code);
    if (!room) return { room: null, left: false };
    const left = room.members.delete(clientId);
    if (room.members.size === 0) room.emptySince = now();
    return { room, left };
  };

  /** Последний снапшот персонажа в комнате (LWW по revision). */
  const putSnapshot = ({ code, characterId, revision, snapshot, fromClientId, fromName }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const previous = room.lastSnapshots.get(characterId);
    if (previous && Number(revision) < Number(previous.revision)) {
      return { room, stored: false, currentRevision: previous.revision };
    }
    room.lastSnapshots.set(characterId, {
      characterId, revision: Number(revision) || 0, snapshot, fromClientId, fromName, updatedAt: now(),
    });
    return { room, stored: true, currentRevision: Number(revision) || 0 };
  };

  const isOwner = (code, clientId) => rooms.get(code)?.ownerClientId === clientId;
  const getRoom = (code) => rooms.get(code) || null;
  const getState = (code) => {
    const room = rooms.get(code);
    return room ? roomSnapshot(room) : null;
  };

  /** Чистка комнат, опустевших дольше TTL (пустые = 0 подключённых членов). */
  const sweep = () => {
    const removed = [];
    for (const room of rooms.values()) {
      if (room.members.size === 0) {
        if (!room.emptySince) room.emptySince = now();
        if (now() - room.emptySince >= limits.EMPTY_ROOM_TTL_MS) {
          rooms.delete(room.code);
          removed.push(room.code);
        }
      }
    }
    return removed;
  };

  return {
    createRoom, joinRoom, leaveRoom, putSnapshot, isOwner, getRoom, getState, sweep,
    _rooms: rooms, // диагностика/тесты
  };
};

module.exports = { createRoomRegistry };
