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
  applyKeyAccessToSession,
} = require('./lootTradeSession');
const {
  KEY_ACCESS,
  resolveKeyAccess,
} = require('./keyAccess');
const {
  normalizeTerminalConfig,
  publicGameState,
  syncGameConfig,
  closeGame,
  createGame,
  applyGameAction,
} = require('./terminalHacking');
const {
  createLockGame,
  keyWonLockGame,
  syncLockGameConfig,
  publicLockGameState,
  closeLockGame,
  applyLockAction,
  shouldBlockLock,
} = require('./lockPicking');

const newOwnerToken = () => crypto.randomBytes(16).toString('hex');

/**
 * @param {{ now?: () => number, rng?: (max: number) => number, limits?: object }} deps
 * now/rng — точки подмены для тестов (TTL, коллизии кодов).
 */
const {
  PROTOCOL_MAX_TRANSFER_OPERATIONS,
  applyStorageDeposits,
  sanitizeItemSnapshot,
  isValidQuantity,
} = require('./partyStorageRules');

const createRoomRegistry = ({ now = () => Date.now(), rng = undefined, limits = LIMITS } = {}) => {
  // Патч 520: ядро замка ждёт rng() -> [0,1); тестовый rng(max) -> целое.
  const lockRandom = rng ? () => rng(1000) / 1000 : Math.random;
  const rooms = new Map(); // code -> room
  const ipRoomLog = new Map(); // ip -> [ts] (создания комнат за сутки)
  const ipJoinLog = new Map(); // ip -> [ts] (входы за минуту)
  const lastRng = rng; // jest/vitest подмена
  // Патч 506: номер трансляции терминала. Не меняется на ходах и при правке
  // карточки; обновляется только после явной повторной выдачи Мастером.
  // Клиент использует его как «билет» одноразового доступа к мини-игре.
  let broadcastCounter = 0;
  const newBroadcastId = () => `broadcast-${++broadcastCounter}`;
  // Патч 508: хранилище Мастера + снапшот игрокам. Сервер держит только
  // ТЕКУЩИЙ снимок в памяти комнаты (как activeSession / terminalStates) и
  // ничего не пишет на диск. Канон — локальное хранилище Мастера; он
  // поднимает его в комнату сообщением `storage.restore` при подключении.
  let storageEntryCounter = 0;
  const emptyStorage = () => ({ revision: 0, entries: [] });
  // Патч 522: импорт снимка приходит по сети — не даём строке/объекту
  // притвориться массивом записей и уронить комнату.
  const cloneStorage = (storage) => ({
    revision: Number(storage?.revision) || 0,
    entries: (Array.isArray(storage?.entries) ? storage.entries : [])
      .map((entry) => ({ ...entry, item: { ...(entry.item || {}) } })),
  });
  const isGmOnline = (room) => Boolean(room.ownerClientId && room.members.has(room.ownerClientId));
  const storageSnapshot = (room) => ({
    ...cloneStorage(room.partyStorage),
    gmOnline: isGmOnline(room),
  });

  /**
   * Патч 516: «доступ разрешён ключом» — выигранное состояние терминала без
   * мини-игры. Доски нет, попытки не тратились, уведомление Мастеру не шлём:
   * Мастер сам создал ключ, связал его с точкой и выдал.
   */
  const keyWonGame = (config, at) => (config?.kind === 'lock' ? keyWonLockGame(config, at) : ({
    status: 'won',
    result: 'ACCESS GRANTED',
    scrollUp: true,
    name: String(config?.name || '').trim() || 'Терминал',
    description: String(config?.description || '').trim(),
    attempts: 4,
    attemptsMax: 4,
    guesses: [],
    wordRanges: [],
    bracketRanges: [],
    hackedByKey: true,
    revision: 1,
    updatedAt: at,
  }));

  const recordAccessEvent = (room, containerId, kind = 'hacked', by = '') => {
    const id = String(containerId || '').trim();
    if (!id || room.accessEvents.has(id)) return false;
    room.accessEvents.set(id, { containerId: id, kind, by, at: now() });
    return true;
  };

  const resolveForRoom = (room) => (requirement) => resolveKeyAccess(requirement, {
    storage: room.partyStorage,
    terminalStates: room.terminalStates,
    accessEvents: room.accessEvents,
  });

  /** Пересчитать доступ по текущему складу, терминалам и журналу ворот. */
  const refreshKeyAccess = (room) => {
    if (!room) return;
    const resolve = resolveForRoom(room);

    // Патч 523: взлом АДРЕСНЫЙ. Событие порождает только та точка, которая
    // реально открыта ключом или своей мини-игрой. Точка, открытая чужим
    // событием через явную ссылку («ИЛИ»), НЕ становится новым источником —
    // транзитивного каскада A → B → C больше нет. Ключ при этом может быть
    // назначен многим точкам: каждая открывается им независимо, поточечно.
    const recordFromSession = (session) => {
      let added = false;
      if (session.keyUnlocked && session.containerId) {
        if (recordAccessEvent(room, session.containerId, 'hacked', 'key')) added = true;
      }
      for (const node of session.nodes || []) {
        if (node.keyUnlocked && node.containerId) {
          if (recordAccessEvent(room, node.containerId, 'hacked', 'key')) added = true;
        }
      }
      return added;
    };

    // Один проход: явные ссылки на уже созданные точки работают, цепочка — нет.
    for (let pass = 0; pass < 1; pass += 1) {
      let added = false;
      if (room.activeSession) {
        room.activeSession = applyKeyAccessToSession(room.activeSession, resolve);
        if (recordFromSession(room.activeSession)) added = true;
      }
      for (const [id, entry] of room.terminalStates) {
        const decision = resolve({
          requiredKeyItemId: entry.config?.requiredKeyItemId,
          keyRequirement: entry.config?.keyRequirement,
          linkedCheckId: entry.config?.linkedCheckId,
          linkedCheckIds: entry.config?.linkedCheckIds,
        });
        entry.keyAccessState = decision.state;
        entry.keyUnlocked = decision.state === KEY_ACCESS.OPEN_BY_KEY;
        if (entry.game?.status === 'won' || decision.state === KEY_ACCESS.OPEN_BY_KEY) {
          if (recordAccessEvent(room, id, 'hacked', entry.game?.operatorName || 'gm')) added = true;
        }
        if (decision.state === KEY_ACCESS.OPEN_BY_KEY && !entry.game?.hackedByKey) {
          entry.game = keyWonGame(entry.config, now());
          entry.closed = false;
          entry.accessId = newBroadcastId();
          entry.updatedAt = now();
        }
      }
      if (!added) break;
    }
    // Финальный пересчёт: событие последнего прохода могло открыть ещё узел.
    if (room.activeSession) {
      room.activeSession = applyKeyAccessToSession(room.activeSession, resolve);
    }
  };

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
    // Патч 517: ворота. Нейтральное событие `hacked` живёт на комнате, а не
    // во вкладке игрока; точки ссылаются на него через linkedCheckId.
    accessEvents: new Map(),
    // Патч 520/527/528: диагностический счётчик сломанных заколок. С 528
    // сервер НЕ правит опубликованный снимок листа: он шлёт клиенту команду
    // char.spend (списать предмет штатными средствами) и char.refresh
    // (обновить снимок), а снимок меняется только обычным char.publish.
    pinLedger: new Map(),
    // Неподтверждённые команды списания: до публикации свежего листа. Нужны,
    // чтобы повторить команду при переподключении вкладки оператора.
    pendingPinSpends: new Map(),
    partyStorage: emptyStorage(),
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
    // Патч 528: команды, которые клиент обязан применить после реконнекта.
    pendingSpends: [...(room.pendingPinSpends?.values() || [])].map((entry) => ({ ...entry })),
    terminalStates: Object.fromEntries([...room.terminalStates.entries()].map(([id, entry]) => [
      id,
      terminalPublic(id, entry),
    ])),
    // Патч 517: при подключении игрок сразу видит, какие ворота уже пройдены.
    accessEvents: Object.fromEntries(room.accessEvents || new Map()),
    // Патч 508: игрок при подключении получает текущий снапшот хранилища.
    // gmOnline говорит клиенту, можно ли сейчас класть/забирать.
    partyStorage: storageSnapshot(room),
    lastClosedSession: room.lastClosedSession || null,
    directives: cloneDirectives(room.directives),
    // Признак обновлённого сервера: клиент включает синхронизированную игру,
    // а при отсутствии поля запускает мини-игру локально (старый сервер комнат
    // не знает terminal.issue/terminal.action и превращал терминал в сундук).
    capabilities: { terminalHacking: true, lockPicking: true },
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
    // Патч 528: свежий лист уже учёл списание — повторять команду не надо.
    // Это же снимает гонку, если char.refresh/char.spendAck потерялся.
    for (const [spendId, pending] of room.pendingPinSpends || []) {
      if (pending.characterId === characterId) room.pendingPinSpends.delete(spendId);
    }
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

  /**
   * Патч 523: локация, привязанная к нескольким серверным комнатам, имеет
   * ОДНО состояние и ОДНИ ресурсы. Коды комнат задают только видимость групп:
   * взлом/покупка/касса в партии 1 сразу видны партии 2, а партия 3 не видит
   * ничего, пока её код не добавят. Объект сессии общий для всех комнат.
   */
  const boundRoomsForSession = (session, fallbackCode = '') => {
    if (!session || session.kind !== 'hub') return [];
    const codes = Array.isArray(session.roomCodes) && session.roomCodes.length
      ? session.roomCodes
      : [fallbackCode].filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const raw of codes) {
      const code = String(raw || '').trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const target = rooms.get(code);
      if (target) out.push(target);
    }
    return out;
  };

  const propagateSharedSession = (session, fallbackCode = '') => {
    const bound = boundRoomsForSession(session, fallbackCode);
    for (const target of bound) target.activeSession = session;
    return bound;
  };

  const withBoundRooms = (result, session, fallbackCode = '') => {
    const bound = session ? propagateSharedSession(session, fallbackCode) : [];
    return { ...result, boundRooms: bound.length ? bound : [result.room] };
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
    refreshKeyAccess(room);
    // Патч 504: открытие/повторная выдача локации — это новая трансляция,
    // она снимает «Закрыт» с терминалов, которые Мастер закрыл решением «Нет».
    syncTerminalNodes(room, normalized, { reissue: true });
    room.lastClosedSession = null;
    // Привязанные комнаты видят ТУ ЖЕ сессию (общие ресурсы локации).
    return withBoundRooms(
      { room, session: room.activeSession || normalized },
      room.activeSession || normalized,
      code,
    );
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
    return withBoundRooms({ room, session: result.session }, result.session, code);
  };

  const terminalPublic = (terminalId, entry) => ({
    containerId: terminalId,
    config: entry.config,
    // Патч 504: «Закрыт» — решение Мастера «Нет». Поле `locked` оставлено как
    // алиас для клиентов предыдущих версий: они просто не дают нажать кнопки.
    closed: Boolean(entry.closed),
    locked: Boolean(entry.closed),
    // Мастеру нужно показать диалог «Разрешить повторный взлом? Да/Нет».
    // Патч 526: для замков вопрос не задаётся — замки пока не блокируются,
    // игрок сам начинает новый подход; awaitingRetry у замка означает
    // «подход завершён» (например, кончились заколки).
    awaitingGm: Boolean(
      entry.config?.kind !== 'lock' && entry.game?.status === 'awaitingRetry',
    ),
    standaloneIssued: Boolean(entry.standaloneIssued),
    // Патч 506/526: стабильный идентификатор текущей трансляции. Раньше
    // служил «билетом» на один взлом; с 526 игрок сам решает, сколько
    // подходов сделать, — поле остаётся для диагностики и совместимости.
    accessId: entry.accessId || null,
    // Патч 516: состояние требования ключа для карточки терминала.
    keyAccessState: entry.keyAccessState || KEY_ACCESS.NONE,
    keyUnlocked: Boolean(entry.keyUnlocked),
    game: entry.config?.kind === 'lock'
      ? publicLockGameState(entry.game)
      : publicGameState(entry.game),
    updatedAt: entry.updatedAt,
  });

  /**
   * Патч 504: правка карточки во время доступа больше не стирает состояние
   * партии и не «запекает» старые настройки в доску. `config` всегда свежий,
   * «Да» Мастера собирает по нему новую доску. `reissue` — явная повторная
   * трансляция терминала/локации, она снимает «Закрыт».
   */
  const mergeTerminalConfig = (previous, config, { reissue = false, standaloneIssued = false } = {}) => {
    if (!previous) {
      return {
        config,
        closed: false,
        standaloneIssued,
        accessId: newBroadcastId(),
        game: null,
        updatedAt: now(),
      };
    }
    // Активную доску не пересобираем на ходу: игрок не теряет прогресс из-за
    // того, что Мастер поправил карточку. Новая сложность вступит в силу при
    // следующей новой партии — «Да» Мастера или «Взломать» другого игрока.
    let game = previous.game
      ? (config.kind === 'lock'
          ? syncLockGameConfig(previous.game, config)
          : syncGameConfig(previous.game, config))
      : null;
    if (reissue && game?.status === 'closed') game = null;
    return {
      ...previous,
      config,
      closed: reissue ? false : Boolean(previous.closed),
      standaloneIssued: standaloneIssued || Boolean(previous.standaloneIssued),
      // Повторная трансляция выдаёт новый «билет»; обычная правка карточки — нет.
      accessId: reissue ? newBroadcastId() : (previous.accessId || newBroadcastId()),
      game,
      updatedAt: now(),
    };
  };

  const syncTerminalNodes = (room, session, options = {}) => {
    if (!room || session?.kind !== 'hub' || !Array.isArray(session.nodes)) return;
    for (const node of session.nodes) {
      // Патч 520: замки живут в том же реестре состояний проверок, что и
      // терминалы — оператор, «Да/Нет» Мастера и общий журнал событий достаются
      // без дублирования сетевого кода.
      if (node?.kind !== 'terminal' && node?.kind !== 'lock') continue;
      const config = normalizeTerminalConfig({
        containerId: node.containerId,
        name: node.name,
        description: node.description,
        difficulty: node.difficulty,
        kind: node.kind,
        requiredKeyItemId: node.requiredKeyItemId,
        keyRequirement: node.keyRequirement,
        linkedCheckId: node.linkedCheckId,
        linkedCheckIds: node.linkedCheckIds,
      });
      if (!config.containerId || !config.name) continue;
      const previous = room.terminalStates.get(config.containerId);
      room.terminalStates.set(
        config.containerId,
        mergeTerminalConfig(previous, config, options),
      );
    }
  };

  /** Зарегистрировать доступный терминал в комнате (только владелец комнаты). */
  const issueTerminal = ({ code, clientId, config: rawConfig, reissue = false, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    const config = normalizeTerminalConfig(rawConfig);
    if (!config.containerId || !config.name) return { error: ERROR_CODE.BAD_MESSAGE };
    ensureOwnerMemberWs(room, clientId, ws);
    const previous = room.terminalStates.get(config.containerId);
    const entry = mergeTerminalConfig(previous, config, { reissue, standaloneIssued: true });
    room.terminalStates.set(config.containerId, entry);
    refreshKeyAccess(room);
    return { room, terminal: terminalPublic(config.containerId, entry) };
  };

  /** Выполнить синхронизированное действие терминала. */
  const terminalAction = ({ code, clientId, characterId, containerId, action, value, ownerToken = null, ws = null }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const id = String(containerId || '').trim();
    const entry = room.terminalStates.get(id);
    if (!entry) return { error: ERROR_CODE.TERMINAL_NOT_ISSUED };
    // Патч 504: решение о повторном взломе и повторная трансляция — действия
    // Мастера. Игрок не может ни обойти отказ, ни сам «открыть» терминал.
    if (['unlock', 'reset', 'reissue', 'retry'].includes(action)) {
      rebindOwnerIfTokenMatches(room, clientId, ownerToken);
      if (!isOwner(code, clientId)) return { error: ERROR_CODE.TERMINAL_GM_ONLY };
      if (action === 'retry') {
        // Патч 526: замки пока не блокируются, решение Мастера «Да/Нет»
        // относится только к терминалу. Владелец добавит условие блокировки
        // позже — then shouldBlockLock() включится и здесь.
        if (entry.config?.kind === 'lock') return { error: ERROR_CODE.TERMINAL_NOT_ACTIVE };
        if (entry.game?.status !== 'awaitingRetry') return { error: ERROR_CODE.TERMINAL_NOT_ACTIVE };
        const decision = value === 'yes' || value === true ? 'yes'
          : (value === 'no' || value === false ? 'no' : null);
        if (!decision) return { error: ERROR_CODE.BAD_MESSAGE };
        if (decision === 'no') {
          // «Нет» — карточка остаётся visible, но ни взломать, ни посмотреть
          // её нельзя до новой трансляции Мастером.
          entry.game = entry.config?.kind === 'lock'
            ? closeLockGame(entry.game, { now: now() })
            : closeGame(entry.game, { now: now() });
          entry.closed = true;
          entry.updatedAt = now();
          return { room, terminal: terminalPublic(id, entry) };
        }
        // «Да» — СРАЗУ новая доска по ТЕКУЩИМ настройкам карточки. Оператор
        // сохраняется, но другой игрок может нажать «Взломать» и собрать
        // доску уже под свой лист (механика передачи хода из патча 503).
        const operatorCharacterId = entry.game.operatorCharacterId || null;
        const operatorClientId = entry.game.operatorClientId || null;
        const operatorName = entry.game.operatorName || '';
        const published = operatorCharacterId ? room.lastSnapshots.get(operatorCharacterId) : null;
        // Сохраняем лист оператора: иначе новая доска собралась бы под
        // дефолтные ИНТ/Науку/Удачу и «Да» незаметно поменяло бы условия.
        const operatorSnapshot = entry.operatorSnapshot || published?.snapshot || {};
        const fresh = entry.config?.kind === 'lock'
          ? createLockGame({
              config: entry.config,
              operatorClientId,
              operatorCharacterId,
              characterSnapshot: operatorSnapshot,
              now: now(),
              rng: lockRandom,
              spentPins: 0,
            })
          : createGame({
              config: entry.config,
              operatorClientId,
              operatorCharacterId,
              characterSnapshot: operatorSnapshot,
              now: now(),
              excludeWords: room.recentTerminalWords || [],
            });
        fresh.operatorName = operatorName;
        entry.game = fresh;
        entry.closed = false;
        entry.accessId = newBroadcastId();
        if (Array.isArray(fresh.wordRanges)) {
          const words = fresh.wordRanges.map((range) => range.word);
          room.recentTerminalWords = [...words, ...(room.recentTerminalWords || [])].slice(0, 60);
        }
        entry.updatedAt = now();
        return { room, terminal: terminalPublic(id, entry) };
      }
      // unlock/reset/reissue — повторная трансляция терминала.
      entry.closed = false;
      entry.game = null;
      entry.accessId = newBroadcastId();
      entry.updatedAt = now();
      return { room, terminal: terminalPublic(id, entry) };
    }
    // Патч 516: без обязательного ключа или привязанной проверки мини-игра
    // не запускается вообще — игрок получает понятный отказ.
    if ((action === 'start' || action === 'newAttempt') && (entry.keyAccessState === KEY_ACCESS.DENIED
      || entry.keyAccessState === KEY_ACCESS.NEEDS_CHECK)) {
      return { error: ERROR_CODE.KEY_REQUIRED };
    }
    const member = room.members.get(clientId);
    if (member?.role !== 'player') return { error: ERROR_CODE.TERMINAL_VIEW_ONLY };
    const charId = String(characterId || '').trim();
    const published = room.lastSnapshots.get(charId);
    if (!charId || !published || published.fromClientId !== clientId) return { error: ERROR_CODE.SESSION_FORBIDDEN };
    // Патч 501: весь опубликованный конверт. Движок сам снимает обёртку data
    // и понимает legacy-массивы [{ name, value }] из сохранения. Объявление
    // вынесено выше: новый подход (526) читает тот же текущий снимок листа.
    const snapshot = published.snapshot || {};
    // Патч 526: игрок сам начинает новый подход (купил заколки, прокачал
    // PER/LOCKPICK). Это НЕ автоперезапуск после победы: действие приходит
    // только по нажатию «Взломать»/«Ещё подход», а `start` по-прежнему
    // запрещён при won/playing. Терминал после блокировки может открыть
    // только Мастер («Да» или reissue) — для него новый подход недоступен.
    if (action === 'newAttempt') {
      if (entry.config?.kind !== 'lock') return { error: ERROR_CODE.TERMINAL_NOT_ACTIVE };
      if (shouldBlockLock({ game: entry.game, config: entry.config })) {
        return { error: ERROR_CODE.LOCK_BLOCKED };
      }
      const fresh = createLockGame({
        config: entry.config,
        operatorClientId: clientId,
        operatorCharacterId: charId,
        characterSnapshot: snapshot,
        now: now(),
        rng: lockRandom,
        spentPins: 0,
      });
      fresh.operatorName = String(published.fromName || snapshot?.name || '').trim();
      entry.game = fresh;
      entry.closed = false;
      entry.operatorSnapshot = published.snapshot || {};
      entry.updatedAt = now();
      refreshKeyAccess(room);
      return { room, terminal: terminalPublic(id, entry) };
    }
    if (entry.closed || entry.game?.status === 'closed') return { error: ERROR_CODE.TERMINAL_CLOSED };
    if (entry.game?.status === 'awaitingRetry') return { error: ERROR_CODE.TERMINAL_AWAITING_RETRY };
    // Патч 505: взломанный терминал не переходит к другому оператору и не
    // собирает новую доску. Иначе лишний start после ACCESS GRANTED (в том
    // числе от переподключившейся вкладки) стирал победу. Сбросить партию
    // может только Мастер явной повторной трансляцией (reissue).
    if (action === 'start' && entry.game?.status === 'won') {
      return { error: ERROR_CODE.TERMINAL_ALREADY_ACTIVE };
    }
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
    const result = entry.config?.kind === 'lock'
      ? applyLockAction({
          game: entry.game,
          config: entry.config,
          action,
          clientId,
          characterId: charId,
          characterSnapshot: snapshot,
          value,
          now: now(),
          rng: lockRandom,
          spentPins: 0,
        })
      : applyGameAction({
          game: entry.game || entry.config,
          config: entry.config,
          action,
          clientId,
          characterId: charId,
          characterSnapshot: snapshot,
          value,
          now: now(),
          excludeWords: room.recentTerminalWords || [],
        });
    if (result.error) return { error: ERROR_CODE[result.error] || result.error };
    if (action === 'start') entry.operatorSnapshot = published.snapshot || {};
    const brokenBefore = Number(entry.game?.brokenPins || 0);
    entry.game = result.game;
    let pinsToSpend = 0;
    if (entry.config?.kind === 'lock' && result.game?.brokenPins > brokenBefore) {
      const delta = result.game.brokenPins - brokenBefore;
      // Патч 528: сервер НЕ трогает инвентарь в опубликованном снимке. Он лишь
      // сообщает сетевому слою, сколько заколок надо списать: тому клиенту
      // уйдут char.spend и char.refresh, а снимок обновится штатным
      // char.publish уже после списания. Владелец листа — клиент.
      pinsToSpend = delta;
      room.pinLedger?.set(charId, (room.pinLedger?.get(charId) || 0) + delta);
    }
    if (entry.config?.kind !== 'lock' && action === 'start' && Array.isArray(entry.game?.wordRanges)) {
      // Держим слова последних трёх досок (по 12–20 слов каждая).
      const fresh = entry.game.wordRanges.map((range) => range.word);
      room.recentTerminalWords = [...fresh, ...(room.recentTerminalWords || [])].slice(0, 60);
    }
    if (entry.config?.kind !== 'lock' && result.usedDigest) {
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
    // Патч 516: взлом привязанного терминала снимает NEEDS_CHECK у точек,
    // для которых ключ был необязательным.
    refreshKeyAccess(room);
    return {
      room,
      terminal: terminalPublic(id, entry),
      usedDigest: Boolean(result.usedDigest),
      pinsToSpend,
      characterId: charId,
      clientId,
    };
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
    const bound = previous ? boundRoomsForSession(previous, code) : [];
    for (const target of bound) target.activeSession = null;
    room.activeSession = null;
    if (previous) {
      room.lastClosedSession = { session: previous, closedReason: 'gm_closed', closedAt: now() };
    }
    return {
      room,
      session: null,
      closedSession: previous,
      boundRooms: bound.length ? bound : [room],
    };
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
    const closedSet = new Set(current.closedByClientIds || []);
    closedSet.add(clientId);

    // Патч 506: «Покинуть локацию». Игрок отключается от выданной локации
    // сам, но сессия Мастера остаётся активной для остальных игроков —
    // локацию по-прежнему закрывает только Мастер. Просто помечаем этого
    // участника в closedByClientIds (оверлей игрока уже читает это поле).
    if (current.kind === 'hub') {
      const nextSession = {
        ...current,
        closedByClientIds: [...closedSet],
        revision: current.revision + 1,
        updatedAt: now(),
      };
      room.activeSession = nextSession;
      return { room, session: nextSession, closedSession: null, closedReason: null };
    }

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

    // Патч 510: ключ, найденный в контейнере, становится общей записью
    // склада, а не личным предметом забравшего игрока.
    const foundKeys = (result.granted || []).filter((entry) => entry?.keyItemId);
    for (const found of foundKeys) {
      appendKeyItem(room, {
        keyItemId: found.keyItemId,
        name: found.name,
        description: found.keyDescription,
        clientId,
      });
    }

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
          boundRooms: boundRoomsForSession(closedSession, code),
        };
      }
      const updatedSession = {
        ...result.session,
        closedByClientIds: [...closedSet],
      };
      room.activeSession = updatedSession;
      const updated = withBoundRooms(
        { room, granted: result.granted, session: updatedSession },
        updatedSession,
        code,
      );
      room.activeSession = updatedSession;
      return updated;
    }

    const finalResult = withBoundRooms({
      room,
      granted: result.granted,
      emptiedNodeContainerId: result.emptiedNodeContainerId || null,
      session: result.session,
    }, result.session, code);
    room.activeSession = result.session;
    return finalResult;
  };

  /** Атомарная бартерная сделка игрока с торговцем. */
  const tradeCommit = ({ code, clientId, payload }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    const result = applyAtomicTradeCommit(room.activeSession, payload, now());
    if (result.error) return result;
    room.activeSession = result.session;
    return withBoundRooms(
      { room, committed: result.committed, session: result.session },
      result.session,
      code,
    );
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

  /**
   * Патч 507: положить предмет в «Общее хранилище» комнаты.
   * Мастер и игроки могут класть; забирать — только игроки (см. дизайн:
   * добытое принадлежит партии, Мастер управляет миром, но не чужим багажом).
   */
  const depositToPartyStorage = ({ code, clientId, name, item, quantity }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    // Без Мастера в сети хранилище доступно только для просмотра.
    if (!isGmOnline(room)) return { error: ERROR_CODE.STORAGE_GM_OFFLINE };
    const qty = Math.floor(Number(quantity));
    if (!item || typeof item !== 'object' || Array.isArray(item) || !isValidQuantity(qty)) {
      return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
    }
    const plain = sanitizeItemSnapshot(item);
    if (!plain) return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
    const member = room.members.get(clientId);
    // Патч 518 (слово владельца): Мастер НЕ вносит вещи на общий склад.
    // Он только смотрит список и транслирует ключи.
    if (member?.role !== 'player') return { error: ERROR_CODE.STORAGE_FORBIDDEN };
    const storage = room.partyStorage || emptyStorage();
    // Патч 521: одинаковые предметы ложатся в одну строку, а переполнение
    // склада возвращает ошибку ДО изменения состояния комнаты.
    const applied = applyStorageDeposits({
      entries: storage.entries,
      deposits: [{ item: plain, quantity: qty, name: String(plain.name || name || '').trim() || 'Предмет' }],
      makeEntry: ({ item: putItem, name: putName, quantity, at }) => ({
        entryId: `st_${now()}_${++storageEntryCounter}`,
        item: putItem,
        name: putName,
        itemType: String(putItem.itemType || 'misc'),
        quantity,
        depositedBy: clientId,
        depositedByName: String(member?.name || putName || '').trim(),
        at,
      }),
      at: now(),
    });
    if (applied.error) return { error: ERROR_CODE[applied.error] || ERROR_CODE.STORAGE_BAD_MESSAGE };
    storage.entries = applied.entries;
    storage.revision += 1;
    room.partyStorage = storage;
    const entry = applied.added[applied.added.length - 1] || null;
    return { room, storage: storageSnapshot(room), entry: entry ? { ...entry } : null };
  };

  /**
   * Патч 518: одна кнопка «Перенести» применяет ВСЕ отложенные операции
   * буфера атомарно. Пока кнопка не нажата, сервер ничего не меняет.
   */
  const transferPartyStorage = ({ code, clientId, deposits = [], withdrawals = [] }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (!isGmOnline(room)) return { error: ERROR_CODE.STORAGE_GM_OFFLINE };
    const member = room.members.get(clientId);
    // Мастер не вносит и не забирает предметы — только смотрит и выдаёт ключи.
    if (member?.role !== 'player') return { error: ERROR_CODE.STORAGE_FORBIDDEN };
    const putList = Array.isArray(deposits) ? deposits : [];
    const takeList = Array.isArray(withdrawals) ? withdrawals : [];
    if (putList.length === 0 && takeList.length === 0) {
      return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
    }
    if (putList.length + takeList.length > PROTOCOL_MAX_TRANSFER_OPERATIONS) return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };

    const storage = room.partyStorage || emptyStorage();
    const original = storage.entries;
    // 1) Проверяем ВСЁ до единого изменения.
    const plannedTakes = [];
    for (const req of takeList) {
      const entryId = String(req?.entryId || '').trim();
      const qty = Math.floor(Number(req?.quantity));
      const entry = original.find((e) => e.entryId === entryId);
      if (!entry || entry.kind === 'keyItem' || !isValidQuantity(qty)) {
        return { error: ERROR_CODE.STORAGE_ENTRY_NOT_FOUND };
      }
      if (qty > Number(entry.quantity)) return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
      plannedTakes.push({ entry, qty });
    }
    const plannedPuts = [];
    for (const req of putList) {
      const qty = Math.floor(Number(req?.quantity));
      const item = req?.item;
      if (!item || typeof item !== 'object' || Array.isArray(item) || !isValidQuantity(qty)) {
        return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
      }
      const plain = sanitizeItemSnapshot(item);
      if (!plain) return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
      if (plain.kind === 'keyItem') return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
      plannedPuts.push({ plain, qty, name: String(req?.name || plain.name || '').trim() || 'Предмет' });
    }
    // 2) Применяем целиком: сначала списания, затем поступления.
    let entries = [...original];
    const withdrawn = [];
    for (const { entry, qty } of plannedTakes) {
      const rest = Number(entry.quantity) - qty;
      withdrawn.push({ item: entry.item, name: entry.name, quantity: qty });
      entries = rest > 0
        ? entries.map((e) => (e.entryId === entry.entryId ? { ...e, quantity: rest } : e))
        : entries.filter((e) => e.entryId !== entry.entryId);
    }
    // Патч 521: поступления склеиваются с существующими строками. Проверка
    // лимита идёт здесь же, до единого изменения room.partyStorage.
    const applied = applyStorageDeposits({
      entries,
      deposits: plannedPuts,
      makeEntry: ({ item: putItem, name: putName, quantity, at }) => ({
        entryId: `st_${now()}_${++storageEntryCounter}`,
        item: putItem,
        name: putName,
        itemType: String(putItem.itemType || 'misc'),
        quantity,
        depositedBy: clientId,
        depositedByName: String(member?.name || '').trim(),
        at,
      }),
      at: now(),
    });
    if (applied.error) return { error: ERROR_CODE[applied.error] || ERROR_CODE.STORAGE_BAD_MESSAGE };
    storage.entries = applied.entries;
    storage.revision += 1;
    room.partyStorage = storage;
    const deposited = applied.added.map((entry) => ({ ...entry }));
    return { room, storage: storageSnapshot(room), withdrawn, deposited };
  };

  /** Патч 510: ключевая запись попадает на склад, но не уходит в инвентарь. */
  const appendKeyItem = (room, { keyItemId, name, description, clientId }) => {
    if (!keyItemId) return null;
    const storage = room.partyStorage || emptyStorage();
    const cleanId = String(keyItemId).trim();
    if (storage.entries.some((entry) => entry.kind === 'keyItem' && entry.keyItemId === cleanId)) return null;
    const entry = {
      entryId: `key_${now()}_${++storageEntryCounter}`,
      kind: 'keyItem',
      keyItemId: cleanId,
      name: String(name || '').trim() || cleanId,
      description: String(description || ''),
      itemType: 'keyItem',
      quantity: 1,
      depositedBy: clientId,
      depositedByName: String(room.members.get(clientId)?.name || '').trim(),
      at: now(),
    };
    storage.entries = [...storage.entries, entry];
    storage.revision += 1;
    room.partyStorage = storage;
    refreshKeyAccess(room);
    return entry;
  };

  /** Мастер выдаёт ключевую запись партии напрямую. */
  const addKeyItemToStorage = ({ code, clientId, keyItemId, name, description }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (!isGmOnline(room)) return { error: ERROR_CODE.STORAGE_GM_OFFLINE };
    const member = room.members.get(clientId);
    if (member?.role !== 'gm') return { error: ERROR_CODE.STORAGE_FORBIDDEN };
    if (!String(keyItemId || '').trim()) return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
    const entry = appendKeyItem(room, { keyItemId, name, description, clientId });
    return { room, storage: storageSnapshot(room), entry, added: Boolean(entry) };
  };

  /** Забрать предмет из общего хранилища (только игрок, атомарно). */
  const withdrawFromPartyStorage = ({ code, clientId, entryId, quantity }) => {
    const room = rooms.get(code);
    if (!room || !room.members.has(clientId)) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (!isGmOnline(room)) return { error: ERROR_CODE.STORAGE_GM_OFFLINE };
    const member = room.members.get(clientId);
    if (member?.role !== 'player') return { error: ERROR_CODE.STORAGE_FORBIDDEN };
    const storage = room.partyStorage || emptyStorage();
    const index = storage.entries.findIndex((entry) => entry.entryId === String(entryId || '').trim());
    if (index < 0) return { error: ERROR_CODE.STORAGE_ENTRY_NOT_FOUND };
    const requested = Math.floor(Number(quantity));
    const qty = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, storage.entries[index].quantity)
      : storage.entries[index].quantity;
    const taken = storage.entries[index];
    // Ключевые записи можно только прочитать: они остаются общими.
    if (taken.kind === 'keyItem') return { error: ERROR_CODE.STORAGE_KEY_READ_ONLY };
    const entries = [...storage.entries];
    if (qty >= taken.quantity) entries.splice(index, 1);
    else entries[index] = { ...taken, quantity: taken.quantity - qty };
    storage.entries = entries;
    storage.revision += 1;
    room.partyStorage = storage;
    return {
      room,
      storage: storageSnapshot(room),
      withdrawn: { item: { ...taken.item }, quantity: qty, name: taken.name },
    };
  };

  const getPartyStorage = (code) => storageSnapshot(rooms.get(code) || { partyStorage: emptyStorage(), members: new Map() });

  /**
   * Патч 508: Мастер подключается и поднимает СВОЁ сохранённое хранилище в
   * комнату. Игроки при подключении получают уже актуальный снапшот.
   * Конфликтов нет: изменений вне сети не бывает, Мастер — канон.
   */
  const restorePartyStorage = ({ code, clientId, ownerToken = null, storage }) => {
    const room = rooms.get(code);
    if (!room) return { error: ERROR_CODE.ROOM_NOT_FOUND };
    if (!storage || typeof storage !== 'object' || Array.isArray(storage)
      || !Array.isArray(storage.entries)) {
      return { error: ERROR_CODE.STORAGE_BAD_MESSAGE };
    }
    rebindOwnerIfTokenMatches(room, clientId, ownerToken);
    if (!isOwner(code, clientId)) return { error: ERROR_CODE.NOT_ROOM_OWNER };
    const incoming = cloneStorage(storage);
    const current = room.partyStorage || emptyStorage();
    if (Number(incoming.revision) < Number(current.revision)) {
      return { room, storage: storageSnapshot(room), applied: false };
    }
    room.partyStorage = incoming;
    refreshKeyAccess(room);
    return { room, storage: storageSnapshot(room), applied: true };
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

  /**
   * Патч 528: зарегистрировать команду списания заколки для оператора.
   * Возвращает её идентификатор; команда живёт до публикации свежего листа.
   */
  const registerPinSpend = ({ code, characterId, clientId, count, spendId }) => {
    const room = rooms.get(code);
    if (!room || !spendId || !characterId) return null;
    const entry = {
      spendId: String(spendId),
      characterId: String(characterId),
      clientId: String(clientId || ''),
      count: Math.max(1, Math.floor(Number(count) || 1)),
      itemId: 'item_bobby_pin',
      at: now(),
    };
    room.pendingPinSpends.set(entry.spendId, entry);
    return entry;
  };

  /** Команды, которые надо повторить конкретному клиенту после реконнекта. */
  const pendingSpendsForClient = (code, clientId, characterId = null) => {
    const room = rooms.get(code);
    if (!room) return [];
    return [...(room.pendingPinSpends?.values() || [])]
      .filter((entry) => entry.clientId === clientId
        || (characterId && entry.characterId === characterId))
      .map((entry) => ({ ...entry }));
  };

  return {
    createRoom,
    joinRoom,
    registerPinSpend,
    pendingSpendsForClient,
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
    depositToPartyStorage,
    withdrawFromPartyStorage,
    transferPartyStorage,
    getPartyStorage,
    getAccessEvents: (code) => Object.fromEntries(
      (rooms.get(code)?.accessEvents || new Map()).entries(),
    ),
    addKeyItemToStorage,
    restorePartyStorage,
    sweep,
    // Патч 516: явный пересчёт доступа перед рассылкой (ключ могли найти
    // в том же самом взятии добычи, когда сессия ещё перезаписывалась).
    recomputeKeyAccess: (code) => {
      const room = rooms.get(code);
      if (room) refreshKeyAccess(room);
      return room || null;
    },
    _rooms: rooms, // диагностика/тесты
  };
};

module.exports = { createRoomRegistry };
