'use strict';

// server/roomRegistry.js
// Реестр комнат мастера: чистая память + правила, БЕЗ сети (сеть —
// roomServer.js). Хранит членов комнаты, последние снапшоты персонажей,
// квоты и TTL. Членская запись несёт непрозрачный `ws` (кладёт сетевой
// слой, реестр его никогда не трогает) — так тесты подставляют заглушки.

const crypto = require('node:crypto');
const { ERROR_CODE, LIMITS } = require('./protocol');
const { generateRoomCode, sanitizePrefix } = require('./roomCode');
const {
  normalizeActiveSession,
  applySessionUpdate,
  applyAtomicLootTake,
  applyAtomicTradeCommit,
} = require('./lootTradeSession');
const {
  normalizeTerminalConfig,
  publicGameState,
  applyGameAction,
} = require('./terminalHacking');

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
    activeSession: null, // открытый контейнер добычи или торговец
    terminalStates: new Map(), // общая мини-игра по containerId, не блокирует activeSession
    // Патч 495: слова последних досок, чтобы соседние терминалы не повторялись.
    recentTerminalWords: [],
    lastClosedSession: null, // { session, closedReason, closedAt } — для сверки Мастера после реконнекта
    directives: [], // очередь команд Мастера с подтверждением доставки (ack по characterId)
    createdAt: now(),
    emptySince: null,
  });

  const sanitizeEnvPayload = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch {
      return null;
    }
  };

  const cloneDirectives = (directives) => (
    (directives || []).map((entry) => ({
      ...entry,
      targetCharacterIds: [...(entry.targetCharacterIds || [])],
      ackedByCharacterIds: [...(entry.ackedByCharacterIds || [])],
      envPayload: entry.envPayload ? sanitizeEnvPayload(entry.envPayload) : null,
    }))
  );

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
    activeSession: room.activeSession || null,
    terminalStates: Object.fromEntries([...room.terminalStates.entries()].map(([id, entry]) => [id, {
      containerId: id,
      config: entry.config,
      locked: Boolean(entry.locked),
      standaloneIssued: Boolean(entry.standaloneIssued),
      game: publicGameState(entry.game),
      updatedAt: entry.updatedAt,
    }])),
    lastClosedSession: room.lastClosedSession || null,
    directives: cloneDirectives(room.directives),
    // Признак обновлённого сервера: клиент включает синхронизированную игру,
    // а при отсутствии поля запускает мини-игру локально (старый сервер комнат
    // не знает terminal.issue/terminal.action и превращал терминал в сундук).
    capabilities: { terminalHacking: true },
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

  const joinRoom = ({
    code,
    clientId,
    ip = 'unknown',
    name = '',
    role = 'player',
    ownerToken = null,
    ws = null,
  }) => {
    if (!touchRateLog(ipJoinLog, ip || 'unknown', 60 * 1000, limits.MAX_JOINS_PER_IP_PER_MINUTE)) {
      return { error: ERROR_CODE.RATE_LIMITED };
    }
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (!room.members.has(clientId) && room.members.size >= limits.MAX_MEMBERS_PER_ROOM) {
      return { error: ERROR_CODE.ROOM_FULL };
    }
    if (ownerToken && room.ownerToken && String(ownerToken) === room.ownerToken) {
      room.ownerClientId = clientId;
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

  /**
   * Проверяет, остались ли в комнате другие подключённые игроки, у которых
   * ещё открыта данная раздача добычи или сессия торговли (не считая Мастера и уже закрывших).
   */
  const hasRemainingActiveSessionViewers = (room, session, closedSet) => {
    if (!room || !session) return false;
    if (session.targetType === 'character') return false;
    for (const member of room.members.values()) {
      if (!member || member.role !== 'player') continue;
      if (member.clientId === room.ownerClientId) continue;
      if (closedSet.has(member.clientId)) continue;
      return true;
    }
    return false;
  };

  const leaveRoom = ({ code, clientId, expectedWs = null }) => {
    const room = rooms.get(code);
    if (!room) return { room: null, left: false, closedSession: null, closedReason: null };
    const currentMember = room.members.get(clientId);
    if (!currentMember) {
      return { room, left: false, closedSession: null, closedReason: null };
    }
    if (expectedWs && currentMember.ws && currentMember.ws !== expectedWs) {
      return { room, left: false, closedSession: null, closedReason: null };
    }
    const left = room.members.delete(clientId);
    if (room.members.size === 0) room.emptySince = now();

    let closedSession = null;
    let closedReason = null;
    const current = room.activeSession;
    // Локацию ('hub') закрывает только сам Мастер — уход игроков её не гасит.
    if (left && current && current.kind !== 'hub') {
      const closedSet = new Set(current.closedByClientIds || []);
      const hadPreviousCloseOrEmpty =
        closedSet.size > 0 || (current.kind === 'loot' && current.items.length === 0);
      if (hadPreviousCloseOrEmpty && !hasRemainingActiveSessionViewers(room, current, closedSet)) {
        closedSession = {
          ...current,
          closedByClientIds: [...closedSet],
          revision: current.revision + 1,
          updatedAt: now(),
        };
        closedReason = closedSession.kind === 'loot' && closedSession.items.length === 0
          ? 'loot_emptied'
          : 'player_closed';
        room.activeSession = null;
        room.lastClosedSession = { session: closedSession, closedReason, closedAt: now() };
      }
    }

    return { room, left, closedSession, closedReason };
  };

  /** Последний снапшот персонажа в комнате (LWW по revision; snapshot=null/removed удаляет). */
  const putSnapshot = ({
    code,
    characterId,
    revision,
    snapshot,
    fromClientId,
    fromName,
    removed = false,
  }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (removed || snapshot === null) {
      room.lastSnapshots.delete(characterId);
      return { room, stored: true, removed: true, currentRevision: Number(revision) || 0 };
    }
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

  const rebindOwnerIfTokenMatches = (room, clientId, ownerToken) => {
    if (room && ownerToken && room.ownerToken && String(ownerToken) === room.ownerToken) {
      room.ownerClientId = clientId;
    }
  };

  const ensureOwnerMemberWs = (room, clientId, ws) => {
    if (!room || !clientId || !ws) return;
    const prev = room.members.get(clientId);
    room.members.set(clientId, {
      clientId,
      name: prev?.name || 'GM',
      role: 'gm',
      ws,
    });
    room.emptySince = null;
  };

  /** Открыть сессию добычи или торговли в комнате (только владелец комнаты). */
  const openSession = ({ code, clientId, session, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    const normalized = normalizeActiveSession(session, now());
    if (!normalized) return { error: ERROR_CODE.BAD_MESSAGE };
    ensureOwnerMemberWs(room, clientId, ws);
    room.activeSession = normalized;
    syncTerminalNodes(room, normalized);
    room.lastClosedSession = null;
    return { room, session: normalized };
  };

  /** Живое обновление процентов/кассы/содержимого открытой сессии (только владелец). */
  const updateSession = ({ code, clientId, payload, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    const result = applySessionUpdate(room.activeSession, payload, now());
    if (result.error) return result;
    ensureOwnerMemberWs(room, clientId, ws);
    room.activeSession = result.session;
    syncTerminalNodes(room, result.session);
    return { room, session: result.session };
  };

  const syncTerminalNodes = (room, session) => {
    if (!room || session?.kind !== 'hub' || !Array.isArray(session.nodes)) return;
    for (const node of session.nodes) {
      if (node?.kind !== 'terminal') continue;
      const config = normalizeTerminalConfig({
        containerId: node.containerId,
        name: node.name,
        description: node.description,
        difficulty: node.difficulty,
        lockOnFailure: node.lockOnFailure,
      });
      if (!config.containerId || !config.name) continue;
      const previous = room.terminalStates.get(config.containerId);
      const changed = previous && JSON.stringify(previous.config) !== JSON.stringify(config);
      room.terminalStates.set(config.containerId, previous
        ? { ...previous, config, game: changed ? null : previous.game, updatedAt: now() }
        : { config, locked: false, standaloneIssued: false, game: null, updatedAt: now() });
    }
  };

  const terminalPublic = (terminalId, entry) => ({
    containerId: terminalId,
    config: entry.config,
    locked: Boolean(entry.locked),
    standaloneIssued: Boolean(entry.standaloneIssued),
    game: publicGameState(entry.game),
    updatedAt: entry.updatedAt,
  });

  /** Зарегистрировать доступный терминал в комнате (только владелец комнаты). */
  const issueTerminal = ({ code, clientId, config: rawConfig, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    const config = normalizeTerminalConfig(rawConfig);
    if (!config.containerId || !config.name) return { error: ERROR_CODE.BAD_MESSAGE };
    ensureOwnerMemberWs(room, clientId, ws);
    const previous = room.terminalStates.get(config.containerId);
    const configChanged = previous && JSON.stringify(previous.config) !== JSON.stringify(config);
    const entry = previous
      ? { ...previous, config, standaloneIssued: true, game: configChanged ? null : previous.game, updatedAt: now() }
      : { config, locked: false, standaloneIssued: true, game: null, updatedAt: now() };
    room.terminalStates.set(config.containerId, entry);
    return { room, terminal: terminalPublic(config.containerId, entry) };
  };

  /** Выполнить синхронизированное действие терминала. */
  const terminalAction = ({ code, clientId, characterId, containerId, action, value, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const id = String(containerId || '').trim();
    const entry = room.terminalStates.get(id);
    if (!entry) return { error: ERROR_CODE.TERMINAL_NOT_ISSUED };
    if (action === 'unlock' || action === 'reset') {
      rebindOwnerIfTokenMatches(room, clientId, ownerToken);
      if (!isOwner(code, clientId)) return { error: ERROR_CODE.TERMINAL_GM_ONLY };
      entry.locked = false;
      entry.game = null;
      entry.updatedAt = now();
      return { room, terminal: terminalPublic(id, entry) };
    }
    const member = room.members.get(clientId);
    if (member?.role !== 'player') return { error: ERROR_CODE.TERMINAL_VIEW_ONLY };
    const charId = String(characterId || '').trim();
    const published = room.lastSnapshots.get(charId);
    if (!charId || !published || published.fromClientId !== clientId) return { error: ERROR_CODE.SESSION_FORBIDDEN };
    if (entry.locked || entry.game?.status === 'locked') return { error: ERROR_CODE.TERMINAL_LOCKED };
    // Патч 503: «Взломать» от ДРУГОГО персонажа собирает доску под его лист.
    // Партия всё равно одна на всех: прежний оператор становится зрителем,
    // а повторный start от того же оператора не сбрасывает его прогресс.
    const activeGame = ['playing', 'pendingDigest', 'won'].includes(entry.game?.status);
    const switchingOperator = Boolean(entry.game
      && (entry.game.operatorCharacterId !== charId || entry.game.operatorClientId !== clientId));
    if (action === 'start' && activeGame && !switchingOperator) {
      return { error: ERROR_CODE.TERMINAL_ALREADY_ACTIVE };
    }
    if (action === 'start' && switchingOperator) {
      // Доска пересобирается createGame() из конфигурации терминала, а не из
      // чужого состояния: число слов, скобки и удача берутся из нового листа.
      entry.game = null;
    }
    // Патч 501: передаём весь опубликованный конверт. Движок сам снимает
    // обёртку data и понимает legacy-массивы [{ name, value }] из сохранения;
    // так не теряется имя персонажа из внешней части CHAR_PUBLISH.
    const snapshot = published.snapshot || {};
    const result = applyGameAction({
      game: entry.game || entry.config,
      action,
      clientId,
      characterId: charId,
      characterSnapshot: snapshot,
      value,
      now: now(),
      excludeWords: room.recentTerminalWords || [],
    });
    if (result.error) return { error: ERROR_CODE[result.error] || result.error };
    entry.game = result.game;
    if (action === 'start' && Array.isArray(entry.game?.wordRanges)) {
      // Держим слова последних трёх досок (по 12–20 слов каждая).
      const fresh = entry.game.wordRanges.map((range) => range.word);
      room.recentTerminalWords = [...fresh, ...(room.recentTerminalWords || [])].slice(0, 60);
    }
    if (entry.game?.status === 'locked') entry.locked = true;
    if (result.usedDigest) {
      const nextSnapshot = JSON.parse(JSON.stringify(published.snapshot || {}));
      const snapshotData = nextSnapshot.data && typeof nextSnapshot.data === 'object'
        ? nextSnapshot.data
        : nextSnapshot;
      const used = new Set(Array.isArray(snapshotData.usedMagazineEffects) ? snapshotData.usedMagazineEffects : []);
      used.add('mag_programmers_digest');
      snapshotData.usedMagazineEffects = [...used];
      snapshotData.terminalHacking = { ...(snapshotData.terminalHacking || {}), hasProgrammersDigest: true, digestUsed: true };
      room.lastSnapshots.set(charId, {
        ...published,
        snapshot: nextSnapshot,
        revision: published.revision + 1,
        updatedAt: now(),
      });
    }
    entry.updatedAt = now();
    return { room, terminal: terminalPublic(id, entry), usedDigest: Boolean(result.usedDigest) };
  };

  /** Закрыть активную раздачу/торговлю в комнате (только владелец). */
  const closeSession = ({ code, clientId, sessionId = null, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    ensureOwnerMemberWs(room, clientId, ws);
    const previous = room.activeSession;
    if (sessionId && previous && previous.sessionId !== String(sessionId)) {
      return { room, session: previous };
    }
    room.activeSession = null;
    if (previous) {
      room.lastClosedSession = { session: previous, closedReason: 'gm_closed', closedAt: now() };
    }
    return { room, session: null, closedSession: previous };
  };

  /**
   * Закрытие контейнера добычи по инициативе игрока.
   * Если другие игроки комнаты ещё просматривают контейнер — подключение для них
   * сохраняется, а закрывший игрок отмечается в closedByClientIds.
   * Если больше никто из игроков в контейнер не смотрит — раздача глушится целиком.
   */
  const playerCloseSession = ({ code, clientId, sessionId = null }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const current = room.activeSession;
    if (!current) {
      return { room, session: null, closedSession: null, closedReason: null };
    }
    if (sessionId && current.sessionId !== String(sessionId)) {
      return { room, session: current, closedSession: null, closedReason: null };
    }
    // Локацию ('hub') может закрыть только Мастер; игроки закрывают лишь вложенные окна внутри неё.
    if (current.kind === 'hub') {
      return { room, session: current, closedSession: null, closedReason: null };
    }

    const closedSet = new Set(current.closedByClientIds || []);
    closedSet.add(clientId);

    if (!hasRemainingActiveSessionViewers(room, current, closedSet)) {
      const closedSession = {
        ...current,
        closedByClientIds: [...closedSet],
        revision: current.revision + 1,
        updatedAt: now(),
      };
      const closedReason = closedSession.kind === 'loot' && closedSession.items.length === 0
        ? 'loot_emptied'
        : 'player_closed';
      room.activeSession = null;
      room.lastClosedSession = { session: closedSession, closedReason, closedAt: now() };
      return {
        room,
        session: null,
        closedSession,
        closedReason,
      };
    }

    const nextSession = {
      ...current,
      closedByClientIds: [...closedSet],
      revision: current.revision + 1,
      updatedAt: now(),
    };
    room.activeSession = nextSession;
    return {
      room,
      session: nextSession,
      closedSession: null,
      closedReason: null,
    };
  };

  /** Атомарное взятие предметов игроком из контейнера добычи. */
  const lootTake = ({ code, clientId, payload }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const hadItemsBefore = Array.isArray(room.activeSession?.items)
      && room.activeSession.items.length > 0;
    const result = applyAtomicLootTake(room.activeSession, payload, now());
    if (result.error) return result;

    // Если из контейнера добычи забрали весь лут — закрываем его у забравшего игрока,
    // а если других активных игроков-зрителей нет — сразу глушим всю раздачу.
    const emptiedByTake = Boolean(
      result.session
      && result.session.kind === 'loot'
      && result.session.items.length === 0
      && (hadItemsBefore || result.granted.length > 0),
    );
    if (emptiedByTake) {
      const closedSet = new Set(result.session.closedByClientIds || []);
      closedSet.add(clientId);
      if (!hasRemainingActiveSessionViewers(room, result.session, closedSet)) {
        const closedSession = {
          ...result.session,
          closedByClientIds: [...closedSet],
        };
        room.activeSession = null;
        room.lastClosedSession = {
          session: closedSession,
          closedReason: 'loot_emptied',
          closedAt: now(),
        };
        return {
          room,
          granted: result.granted,
          session: null,
          closedSession,
          autoClosedReason: 'loot_emptied',
        };
      }
      const updatedSession = {
        ...result.session,
        closedByClientIds: [...closedSet],
      };
      room.activeSession = updatedSession;
      return {
        room,
        granted: result.granted,
        session: updatedSession,
      };
    }

    room.activeSession = result.session;
    return {
      room,
      granted: result.granted,
      emptiedNodeContainerId: result.emptiedNodeContainerId || null,
      session: result.session,
    };
  };

  /** Атомарная бартерная сделка игрока с торговцем. */
  const tradeCommit = ({ code, clientId, payload }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const result = applyAtomicTradeCommit(room.activeSession, payload, now());
    if (result.error) return result;
    room.activeSession = result.session;
    return { room, committed: result.committed, session: result.session };
  };

  /** Отправить команду Мастера группе или выбранному персонажу (с очередью для офлайн-телефонов). */
  const issueDirective = ({ code, clientId, ownerToken = null, directive = {}, ws = null }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    const kind = String(directive?.kind || '').trim();
    if (!kind) return { error: ERROR_CODE.BAD_MESSAGE };

    ensureOwnerMemberWs(room, clientId, ws);

    const directiveId = String(directive?.directiveId || '').trim() || crypto.randomUUID();
    const existing = room.directives.find((d) => d.directiveId === directiveId);
    if (existing) {
      return {
        room,
        directive: { ...existing },
        directives: cloneDirectives(room.directives),
      };
    }

    const targetType = directive?.targetType === 'character' ? 'character' : 'room';
    const targetCharacterId = targetType === 'character' && directive?.targetCharacterId
      ? String(directive.targetCharacterId)
      : null;

    let targetCharacterIds = [];
    if (targetType === 'character') {
      if (targetCharacterId) targetCharacterIds = [targetCharacterId];
    } else if (Array.isArray(directive?.targetCharacterIds) && directive.targetCharacterIds.length > 0) {
      targetCharacterIds = [...new Set(
        directive.targetCharacterIds.map((id) => String(id || '').trim()).filter(Boolean),
      )];
    } else {
      targetCharacterIds = [...room.lastSnapshots.keys()];
    }

    const rawAmount = Number(directive?.amount);
    const entry = {
      directiveId,
      kind,
      originRole: 'gm',
      amount: Number.isFinite(rawAmount) ? rawAmount : 1,
      mode: directive?.mode ? String(directive.mode) : null,
      note: String(directive?.note || '').trim().slice(0, 240),
      targetType,
      targetCharacterId,
      targetCharacterIds,
      ackedByCharacterIds: [],
      fromClientId: clientId,
      fromName: room.members.get(clientId)?.name || 'GM',
      envPayload: sanitizeEnvPayload(directive?.envPayload),
      createdAt: now(),
    };

    room.directives.push(entry);
    if (room.directives.length > 20) {
      room.directives.splice(0, room.directives.length - 20);
    }

    return {
      room,
      directive: { ...entry },
      directives: cloneDirectives(room.directives),
    };
  };

  /** Применение предмета / помощи одним игроком комнаты к соседу по комнате (строго peer.consumable). */
  const issuePeerAssist = ({ code, clientId, payload = {} }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const targetCharacterId = String(payload?.targetCharacterId || '').trim();
    if (!targetCharacterId || !room.lastSnapshots.has(targetCharacterId)) {
      return { error: ERROR_CODE.BAD_MESSAGE };
    }
    const envPayload = sanitizeEnvPayload(payload?.envPayload);
    if (!envPayload || !envPayload.item) {
      return { error: ERROR_CODE.BAD_MESSAGE };
    }
    const directiveId = String(payload?.directiveId || '').trim() || crypto.randomUUID();
    const existing = room.directives.find((d) => d.directiveId === directiveId);
    if (existing) {
      return {
        room,
        directive: { ...existing },
        directives: cloneDirectives(room.directives),
      };
    }
    const fromName = String(payload?.fromCharacterName || room.members.get(clientId)?.name || 'Player').trim().slice(0, 80);
    const entry = {
      directiveId,
      kind: 'peer.consumable',
      originRole: 'peer',
      amount: 1,
      mode: null,
      note: String(payload?.note || '').trim().slice(0, 240),
      targetType: 'character',
      targetCharacterId,
      targetCharacterIds: [targetCharacterId],
      ackedByCharacterIds: [],
      fromClientId: clientId,
      fromName,
      envPayload,
      createdAt: now(),
    };

    room.directives.push(entry);
    if (room.directives.length > 20) {
      room.directives.splice(0, room.directives.length - 20);
    }

    return {
      room,
      directive: { ...entry },
      directives: cloneDirectives(room.directives),
    };
  };

  /** Подтверждение применения команды Мастера конкретным персонажем игрока. */
  const ackDirective = ({ code, clientId, directiveId, characterId }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const cleanDirectiveId = String(directiveId || '').trim();
    const cleanCharId = String(characterId || '').trim();
    if (!cleanDirectiveId || !cleanCharId) return { error: ERROR_CODE.BAD_MESSAGE };

    const entry = room.directives.find((d) => d.directiveId === cleanDirectiveId);
    if (entry) {
      if (!entry.ackedByCharacterIds.includes(cleanCharId)) {
        entry.ackedByCharacterIds.push(cleanCharId);
      }
      if (entry.targetType === 'room' && !entry.targetCharacterIds.includes(cleanCharId)) {
        entry.targetCharacterIds.push(cleanCharId);
      }
    }

    return {
      room,
      directive: entry ? { ...entry } : null,
      directives: cloneDirectives(room.directives),
    };
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
    createRoom,
    joinRoom,
    leaveRoom,
    putSnapshot,
    isOwner,
    getRoom,
    getState,
    openSession,
    updateSession,
    issueTerminal,
    terminalAction,
    closeSession,
    playerCloseSession,
    lootTake,
    tradeCommit,
    issueDirective,
    issuePeerAssist,
    ackDirective,
    sweep,
    _rooms: rooms, // диагностика/тесты
  };
};

module.exports = { createRoomRegistry };
