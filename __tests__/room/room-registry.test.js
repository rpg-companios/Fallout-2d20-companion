// Реестр комнат (gm-rooms §3.2–§3.3): создание с уникальным кодом,
// квоты, вход/выход, снапшоты (LWW), TTL пустых, восстановление по токену.

import { describe, expect, it } from 'vitest';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE, LIMITS } from '../../server/protocol.js';

const makeRegistry = (overrides = {}) => createRoomRegistry(overrides);

describe('roomRegistry: создание комнаты', () => {
  it('код генерируется сервером, префикс дефолтный GM', () => {
    const registry = makeRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1', name: 'Стол #1' });
    expect(room.code).toMatch(/^GM-[A-Z2-9]{6}$/);
    expect(room.name).toBe('Стол #1');
    expect(room.ownerToken).toHaveLength(32);
    expect(room.ownerClientId).toBe('gm-1');
  });

  it('префикс мастера (сеттинга): sanitize + никакого хардкода GM', () => {
    const registry = makeRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1', prefix: 'vlt!', name: 'Убежище' });
    expect(room.code.startsWith('VLT-')).toBe(true);
  });

  it('дубликат кода исключён конструктивно: коллизия → перегенерация', () => {
    // rng отдаёт нули первые 12 вызовов (две попытки по 6 знаков = 'AAAAAA'),
    // дальше — меняющаяся последовательность. Реестр обязан: первую комнату
    // создать 'GM-AAAAAA', вторую — после повтора генерации с ДРУГИМ кодом.
    let call = 0;
    const scriptedRng = () => { call += 1; return call <= 12 ? 0 : call % 31; };
    const registry = makeRegistry({ rng: scriptedRng });
    const first = registry.createRoom({ clientId: 'gm' });
    const second = registry.createRoom({ clientId: 'gm' });
    expect(first.room.code).toBe('GM-AAAAAA');
    expect(second.error).toBeUndefined();
    expect(second.room.code).not.toBe(first.room.code);
  });

  it('квота комнат на мастера', () => {
    const registry = makeRegistry({ limits: { ...LIMITS, MAX_ROOMS_PER_OWNER: 2 } });
    expect(registry.createRoom({ clientId: 'gm' }).error).toBeUndefined();
    expect(registry.createRoom({ clientId: 'gm' }).error).toBeUndefined();
    const third = registry.createRoom({ clientId: 'gm' });
    expect(third.error).toBe(ERROR_CODE.ROOM_QUOTA_EXCEEDED);
    // Другой мастер — свободен.
    expect(registry.createRoom({ clientId: 'gm-2' }).error).toBeUndefined();
  });

  it('квота созданий на IP в сутки', () => {
    const registry = makeRegistry({ limits: { ...LIMITS, MAX_ROOMS_PER_IP_PER_DAY: 1 } });
    expect(registry.createRoom({ clientId: 'gm-1', ip: '1.1.1.1' }).error).toBeUndefined();
    expect(registry.createRoom({ clientId: 'gm-2', ip: '1.1.1.1' }).error).toBe(ERROR_CODE.ROOM_QUOTA_EXCEEDED);
    expect(registry.createRoom({ clientId: 'gm-2', ip: '2.2.2.2' }).error).toBeUndefined();
  });

  it('восстановление комнаты: requestedCode + ownerToken', () => {
    const registry = makeRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1', name: 'Стол' });
    // Тот же код без токена/с чужим токеном — отказ.
    expect(registry.createRoom({ clientId: 'thief', requestedCode: room.code }).error)
      .toBe(ERROR_CODE.ROOM_CODE_TAKEN);
    expect(registry.createRoom({ clientId: 'thief', requestedCode: room.code, ownerToken: 'wrong' }).error)
      .toBe(ERROR_CODE.ROOM_CODE_TAKEN);
    // Свой токен — привязка (перезапуск сервера не теряем, но и здесь сценарий
    // «другое устройство мастера»): владелец переназначается.
    const rebound = registry.createRoom({ clientId: 'gm-1-device-2', requestedCode: room.code, ownerToken: room.ownerToken });
    expect(rebound.rebound).toBe(true);
    expect(rebound.room.ownerClientId).toBe('gm-1-device-2');
  });
});

describe('roomRegistry: вход, выход, presence', () => {
  it('join/leave + состояние комнаты', () => {
    const registry = makeRegistry();
    const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
    const joined = registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Иван', role: 'player' });
    expect(joined.error).toBeUndefined();
    expect(joined.state.members).toEqual([{ clientId: 'p1', name: 'Иван', role: 'player' }]);
    const left = registry.leaveRoom({ code: room.code, clientId: 'p1' });
    expect(left.left).toBe(true);
    expect(registry.getState(room.code).members).toEqual([]);
  });

  it('нормализация роли и имени', () => {
    const registry = makeRegistry();
    const { room } = registry.createRoom({ clientId: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', name: '  ', role: 'whatever' });
    expect(registry.getState(room.code).members[0]).toEqual({ clientId: 'p1', name: '—', role: 'player' });
  });

  it('комната не найдена / переполнена', () => {
    const registry = makeRegistry({ limits: { ...LIMITS, MAX_MEMBERS_PER_ROOM: 1 } });
    expect(registry.joinRoom({ code: 'GM-XXXXXX', clientId: 'p1' }).error).toBe(ERROR_CODE.ROOM_NOT_FOUND);
    const { room } = registry.createRoom({ clientId: 'gm' });
    expect(registry.joinRoom({ code: room.code, clientId: 'p1' }).error).toBeUndefined();
    expect(registry.joinRoom({ code: room.code, clientId: 'p2' }).error).toBe(ERROR_CODE.ROOM_FULL);
    // Переподключение уже вошедшего не считается новым членом.
    expect(registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Снова' }).error).toBeUndefined();
    expect(registry.getState(room.code).members).toHaveLength(1);
  });

  it('рейт-лимит входов с одного IP', () => {
    const registry = makeRegistry({ limits: { ...LIMITS, MAX_JOINS_PER_IP_PER_MINUTE: 2 } });
    const { room } = registry.createRoom({ clientId: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', ip: '1.1.1.1' });
    registry.joinRoom({ code: room.code, clientId: 'p2', ip: '1.1.1.1' });
    expect(registry.joinRoom({ code: room.code, clientId: 'p3', ip: '1.1.1.1' }).error)
      .toBe(ERROR_CODE.RATE_LIMITED);
  });
});

describe('roomRegistry: снапшоты и TTL', () => {
  it('последний снапшот по LWW: старая ревизия не затирает новую', () => {
    const registry = makeRegistry();
    const { room } = registry.createRoom({ clientId: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Иван' });
    expect(registry.putSnapshot({ code: room.code, characterId: 'c1', revision: 5, snapshot: { hp: 5 }, fromClientId: 'p1' }).stored).toBe(true);
    expect(registry.putSnapshot({ code: room.code, characterId: 'c1', revision: 3, snapshot: { hp: 3 }, fromClientId: 'p1' }).stored).toBe(false);
    const state = registry.getState(room.code);
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].revision).toBe(5);
  });

  it('снапшот в несуществующую комнату — ROOM_NOT_FOUND', () => {
    const registry = makeRegistry();
    expect(registry.putSnapshot({ code: 'GM-XXXXXX', characterId: 'c1', revision: 1, snapshot: {} }).error)
      .toBe(ERROR_CODE.ROOM_NOT_FOUND);
  });

  it('пустая комната живёт до TTL, потом забирается sweeperом', () => {
    let clock = 1_000_000;
    const registry = makeRegistry({ now: () => clock });
    const { room } = registry.createRoom({ clientId: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1' });
    registry.leaveRoom({ code: room.code, clientId: 'p1' });
    clock += LIMITS.EMPTY_ROOM_TTL_MS - 1;
    expect(registry.sweep()).toEqual([]);
    clock += 2;
    expect(registry.sweep()).toEqual([room.code]);
    expect(registry.getRoom(room.code)).toBeNull();
  });
});
