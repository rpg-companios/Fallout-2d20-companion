'use strict';

// server/lootTradeSession.js
// Атомарная серверная механика выдачи контейнеров добычи и торговли в комнате Мастера.
// Живёт внутри server/, чтобы лёгкий деплой NetAngels (app/server + ws) работал автономно
// без сборки фронтенда. Формулы цен 1-в-1 совпадают с domain/lootTrade.js (проверяется тестом).

const { ERROR_CODE } = require('./protocol');
const {
  itemStackKey,
  effectiveItemCost,
  effectiveItemWeight,
} = require('./itemStacking.js');
const locationGraph = require('./locationGraph.js');
const { resolveLocationNodeMarker, restoreLocationSessionNodes } = require('./locationNodeMarker.js');
const {
  expressionCheckIds,
  normalizeAccessExpression,
  resolveAccessExpression,
  accessBarrierPending,
} = require('./accessExpression.js');
const { encodeTerminalNodeMarker, decodeTerminalNodeMarker } = require('./terminalHacking');
const { encodeLockNodeMarker, decodeLockNodeMarker } = require('./lockPicking');

const normalizeLinkedCheckIds = (raw) => {
  const ids = [
    ...(Array.isArray(raw?.linkedCheckIds) ? raw.linkedCheckIds : []),
    raw?.linkedCheckId,
  ];
  const seen = new Set();
  const out = [];
  for (const value of ids) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === 2) break;
  }
  return out;
};

const clampNumber = (val, min, max, fallback = 0) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const normalizeSaleMarkupPercent = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  return Math.round(clampNumber(value, -100, 1000, fallback));
};

const normalizeBuyDepreciationPercent = (value, fallback = 50) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(clampNumber(Math.abs(num), 0, 100, fallback));
};

const normalizeCapsAmount = (value, fallback = 0) =>
  Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback));

const makeEntryId = (now = Date.now(), idx = 0) =>
  `ent_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`;

// Патч 522: один закон стака для инвентаря, склада и торговцев.
const snapshotMergeSignature = (snapshot) => itemStackKey(snapshot);

const normalizeSessionItem = (raw, now = Date.now(), idx = 0) => {
  if (!raw || typeof raw !== 'object') return null;
  const itemType = String(raw.itemType || 'misc');
  const itemId = String(raw.itemId || raw.id || raw.weaponId || (itemType === 'caps' ? 'caps' : ''));
  const name = String(raw.name || '').trim();
  if (!name && itemType !== 'caps') return null;
  const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
  if (quantity <= 0) return null;

  return {
    entryId: String(raw.entryId || makeEntryId(now, idx)),
    itemId: itemId || name,
    itemType,
    name: name || 'Крышки',
    cost: effectiveItemCost(raw),
    weight: effectiveItemWeight(raw),
    quantity,
    markupPercent: normalizeSaleMarkupPercent(raw.markupPercent, 0),
    itemSnapshot: raw.itemSnapshot && typeof raw.itemSnapshot === 'object'
      ? { ...raw.itemSnapshot }
      : null,
    // Патч 510: ключевая запись, найденная в контейнере, уходит на склад,
    // а не в личный инвентарь.
    keyItemId: raw.keyItemId ? String(raw.keyItemId).trim() : '',
    keyDescription: raw.keyDescription ? String(raw.keyDescription) : '',
  };
};

const addOrMergeSessionItem = (items, rawCandidate, now = Date.now()) => {
  const candidate = normalizeSessionItem(rawCandidate, now);
  if (!candidate) return items;
  const candSig = snapshotMergeSignature(candidate.itemSnapshot);
  const idx = items.findIndex((entry) => (
    entry.itemType === candidate.itemType
    && entry.itemId === candidate.itemId
    && entry.name === candidate.name
    && Number(entry.markupPercent || 0) === Number(candidate.markupPercent || 0)
    && snapshotMergeSignature(entry.itemSnapshot) === candSig
  ));
  if (idx >= 0) {
    items[idx] = {
      ...items[idx],
      quantity: items[idx].quantity + candidate.quantity,
    };
  } else {
    items.push(candidate);
  }
  return items;
};

const normalizeCharacterOverrides = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [charId, val] of Object.entries(raw)) {
    if (!charId || !val || typeof val !== 'object') continue;
    const entry = {};
    if (val.saleMarkupPercent !== undefined) {
      entry.saleMarkupPercent = normalizeSaleMarkupPercent(val.saleMarkupPercent, 0);
    }
    if (val.buyDepreciationPercent !== undefined) {
      entry.buyDepreciationPercent = normalizeBuyDepreciationPercent(val.buyDepreciationPercent, 50);
    }
    if (Object.keys(entry).length > 0) {
      out[charId] = entry;
    }
  }
  return out;
};

const normalizeSessionItemsList = (rawItems, now = Date.now(), baseIdx = 0) => {
  if (!Array.isArray(rawItems)) return [];
  const seenEntryIds = new Set();
  const out = [];
  rawItems.forEach((raw, idx) => {
    const normalized = normalizeSessionItem(raw, now, baseIdx + idx);
    if (!normalized) return;
    let entryId = normalized.entryId;
    if (!entryId || seenEntryIds.has(entryId)) {
      entryId = makeEntryId(now, baseIdx + idx);
    }
    seenEntryIds.add(entryId);
    out.push(entryId === normalized.entryId ? normalized : { ...normalized, entryId });
  });
  return out;
};

const normalizeHubSessionNode = (raw, now = Date.now(), nodeIdx = 0) => {
  if (!raw || typeof raw !== 'object') return null;
  const containerId = String(raw.containerId || raw.id || '').trim();
  if (!containerId) return null;
  // Патч 544: старый сервер мог понизить локацию до сундука и выбросить рёбра
  // графа. Пространственная обёртка в lockLabel восстанавливает тип и связи;
  // внутри неё может лежать прежний маркер терминала/замка.
  const source = resolveLocationNodeMarker(raw);
  const marker = decodeTerminalNodeMarker(source.lockLabel);
  const lockMarker = decodeLockNodeMarker(source.lockLabel);
  const explicitTerminal = source.kind === 'terminal';
  const explicitLock = source.kind === 'lock';
  const kind = source.kind === 'merchant' ? 'merchant'
    : (source.kind === 'hub' ? 'hub'
      : (explicitTerminal || marker ? 'terminal'
        : (explicitLock || lockMarker ? 'lock' : 'loot')));
  const items = kind === 'terminal' || kind === 'lock' || kind === 'hub'
    ? []
    : normalizeSessionItemsList(source.items, now, nodeIdx * 1000);
  return {
    containerId,
    kind,
    name: String(source.name || '').trim() || (kind === 'merchant' ? 'Торговец'
      : (kind === 'hub' ? 'Локация'
        : (kind === 'terminal' ? 'Терминал' : (kind === 'lock' ? 'Замок' : 'Контейнер')))),
    description: String(source.description || '').trim(),
    locked: Boolean(source.locked),
    // На новом сервере обёртка уже развёрнута в поля; наружу отдаём исходную
    // подпись (или маркер терминала/замка), а не служебную JSON-строку.
    lockLabel: String(source.lockLabel || '').trim(),
    caps: kind === 'merchant' ? normalizeCapsAmount(source.caps, 0) : 0,
    saleMarkupPercent: kind === 'merchant' ? normalizeSaleMarkupPercent(source.saleMarkupPercent, 0) : 0,
    buyDepreciationPercent: kind === 'merchant'
      ? normalizeBuyDepreciationPercent(source.buyDepreciationPercent, 50)
      : 50,
    characterOverrides: kind === 'merchant' ? normalizeCharacterOverrides(source.characterOverrides) : {},
    difficulty: kind === 'terminal'
      ? (marker && !explicitTerminal
          ? marker.difficulty
          : Math.max(0, Math.min(5, Math.floor(Number(source.difficulty) || 0))))
      : (kind === 'lock'
          ? (lockMarker && !explicitLock
              ? lockMarker.difficulty
              : Math.max(0, Math.min(5, Math.floor(Number(source.difficulty) || 0))))
          : 0),
    items,
    requiredKeyItemId: String(source.requiredKeyItemId || '').trim(),
    keyRequirement: String(source.keyRequirement || 'none'),
    linkedCheckIds: normalizeLinkedCheckIds(source),
    linkedCheckId: String(source.linkedCheckId || '').trim(),
    accessExpression: normalizeAccessExpression(source.accessExpression),
    exitLocationId: String(source.exitLocationId || '').trim(),
    exitOnly: Boolean(source.exitOnly),
    passageBlocked: Boolean(source.passageBlocked),
    passageReason: String(source.passageReason || '').trim(),
    keyAccessState: String(source.keyAccessState || 'none'),
    keyUnlocked: Boolean(source.keyUnlocked),
    hiddenForPlayers: Boolean(source.hiddenForPlayers),
    parentIds: Array.isArray(source.parentIds)
      ? [...new Set(source.parentIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
    childIds: Array.isArray(source.childIds)
      ? [...new Set(source.childIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
    depth: Math.max(0, Math.floor(Number(source.depth) || 0)),
    roomCodes: Array.isArray(source.roomCodes)
      ? [...new Set(source.roomCodes.map((code) => String(code || '').trim()).filter(Boolean))]
      : [],
  };
};

const normalizeHubSessionNodes = (rawNodes, now = Date.now()) => {
  if (!Array.isArray(rawNodes)) return [];
  const seen = new Set();
  const out = [];
  restoreLocationSessionNodes(rawNodes).forEach((raw, idx) => {
    const node = normalizeHubSessionNode(raw, now, idx);
    if (!node || seen.has(node.containerId)) return;
    seen.add(node.containerId);
    out.push(node);
  });
  // Патч 519: если точка ссылается на терминал как на ворота, этот терминал
  // становится «замком» точки и скрывается из списка локации у игроков.
  // Мастер продолжает видеть все узлы, а сервер по-прежнему создаёт для
  // скрытого терминала состояние мини-игры (syncTerminalNodes).
  const referenced = new Set(
    out.flatMap((n) => expressionCheckIds(resolveAccessExpression(n))),
  );
  return out.map((node) => {
    // Патч 542: замок никогда не самостоятельная точка игрока — только
    // преграда цели. Терминал-источник скрыт, если на него ссылается доступ;
    // непривязанный терминал остаётся отдельной дочерней точкой.
    const hidden = node.kind === 'lock'
      || (node.kind === 'terminal' && referenced.has(node.containerId));
    return hidden ? { ...node, hiddenForPlayers: true } : node;
  });
};

/**
 * Скрывает содержимое и кассу запертых (locked: true) вложенных контейнеров/торговцев
 * от игроков по WebSocket. Мастер получает полное состояние без купюр.
 */
const sanitizeSessionForMember = (session, { isGm = false } = {}) => {
  if (!session || isGm || session.kind !== 'hub') return session;
  // Патч 542: преграда на самой выданной локации скрывает всё её содержимое
  // до прохождения. Игрок видит только проверку входа (узел сессии-корня).
  // Патч 546: преграда — не только флаг `locked`, но и непройденная проверка
  // (`accessExpression`/`linkedCheckIds`), даже если флаг не доехал.
  if (accessBarrierPending(session)) {
    return { ...session, nodes: [] };
  }
  const nodes = session.nodes || [];
  // Патч 523: замок — граница видимости. Игрок видит саму «дверь», но не
  // знает, что за ней: все потомки запертого узла скрыты сервером целиком.
  const graph = locationGraph.buildGraphFromSession(session.containerId, nodes);
  // Патч 543: перекрытая локация — граница видимости как замок: её потомки
  // не уходят игроку, хотя сама «дверь» с причиной остаётся в списке.
  // Патч 546: единый предикат — запертый ИЛИ с непройденной проверкой.
  const lockedIds = nodes
    .filter((node) => accessBarrierPending(node))
    .map((node) => node.containerId);
  // Патч 544: запертый корень выдачи тоже граница видимости для своих детей.
  if (accessBarrierPending(session)) lockedIds.push(session.containerId);
  const hidden = new Set(locationGraph.hiddenBehindLock(graph, {
    lockedIds,
    isGm,
    rootId: session.containerId,
  }));
  return {
    ...session,
    nodes: nodes
      .filter((node) => !node.hiddenForPlayers && !hidden.has(node.containerId))
      .map((node) => {
      // Патч 546: содержимое и касса прячутся за любой непройденной преградой.
      if (!accessBarrierPending(node)) return node;
      return {
        ...node,
        items: [],
        caps: 0,
        saleMarkupPercent: 0,
        buyDepreciationPercent: 50,
        characterOverrides: {},
        hasItemsHint: Array.isArray(node.items) && node.items.length > 0,
      };
      }),
  };
};

/**
 * Патч 516: пересчитать доступ по текущему складу и состояниям терминалов.
 * `resolve` приходит из реестра (там живёт снимок комнаты), поэтому этот
 * модуль остаётся чистой нормализацией без сетевого состояния.
 */
const applyKeyAccessToSession = (session, resolve) => {
  if (!session || typeof resolve !== 'function') return session;
  const decorate = (target) => {
    const decision = resolve({
      requiredKeyItemId: target.requiredKeyItemId,
      keyRequirement: target.keyRequirement,
      linkedCheckIds: target.linkedCheckIds,
      linkedCheckId: target.linkedCheckId,
      accessExpression: target.accessExpression,
    });
    const state = decision?.state || 'none';
    const restricted = state === 'denied' || state === 'needs-check';
    return {
      ...target,
      keyAccessState: state,
      keyUnlocked: state === 'open-by-key',
      // Патч 546: флаг `locked` больше не единственный признак преграды —
      // непройденная проверка держит границу даже без ручного флага.
      locked: restricted || (state === 'none' && accessBarrierPending(target)),
    };
  };
  const next = decorate(session);
  return {
    ...next,
    nodes: Array.isArray(session.nodes) ? session.nodes.map(decorate) : [],
  };
};

const normalizeActiveSession = (raw, now = Date.now()) => {
  if (!raw || typeof raw !== 'object') return null;
  let kind = 'loot';
  if (raw.kind === 'merchant') kind = 'merchant';
  else if (raw.kind === 'hub') kind = 'hub';

  let targetType = raw.targetType === 'character' ? 'character' : 'room';
  const items = kind === 'hub'
    ? []
    : normalizeSessionItemsList(raw.items, now, 0);
  const nodes = kind === 'hub' ? normalizeHubSessionNodes(raw.nodes, now) : [];
  // Терминальные игры всегда общие для всей комнаты, даже если мастер передал
  // локацию с терминалом как персональную раздачу.
  if (kind === 'hub' && nodes.some((node) => node.kind === 'terminal' || node.kind === 'lock')) targetType = 'room';
  const targetCharacterId = targetType === 'character' && raw.targetCharacterId
    ? String(raw.targetCharacterId)
    : null;
  if (targetType === 'character' && !targetCharacterId) return null;
  const closedByClientIds = Array.isArray(raw.closedByClientIds)
    ? [...new Set(raw.closedByClientIds.map((id) => String(id || '')).filter(Boolean))]
    : [];

  const defaultName = kind === 'hub'
    ? 'Локация'
    : (kind === 'merchant' ? 'Торговец' : 'Контейнер');

  return {
    sessionId: String(raw.sessionId || `ses_${now}_${Math.random().toString(36).slice(2, 8)}`),
    containerId: String(raw.containerId || ''),
    kind,
    name: String(raw.name || '').trim() || defaultName,
    description: String(raw.description || '').trim(),
    targetType,
    targetCharacterId,
    targetCharacterName: raw.targetCharacterName ? String(raw.targetCharacterName) : null,
    caps: kind === 'merchant' ? normalizeCapsAmount(raw.caps, 0) : 0,
    saleMarkupPercent: kind === 'merchant' ? normalizeSaleMarkupPercent(raw.saleMarkupPercent, 0) : 0,
    buyDepreciationPercent: kind === 'merchant'
      ? normalizeBuyDepreciationPercent(raw.buyDepreciationPercent, 50)
      : 50,
    characterOverrides: kind === 'merchant' ? normalizeCharacterOverrides(raw.characterOverrides) : {},
    difficulty: kind === 'terminal' || kind === 'lock'
      ? Math.max(0, Math.min(5, Math.floor(Number(raw.difficulty) || 0)))
      : 0,
    items,
    nodes,
    // Патч 516: требование ключа у самой выданной точки.
    requiredKeyItemId: String(raw.requiredKeyItemId || '').trim(),
    keyRequirement: String(raw.keyRequirement || 'none'),
    linkedCheckIds: normalizeLinkedCheckIds(raw),
    linkedCheckId: String(raw.linkedCheckId || '').trim(),
    accessExpression: normalizeAccessExpression(raw.accessExpression),
    exitLocationId: String(raw.exitLocationId || '').trim(),
    // Патч 523: состояние и ресурсы локации общи для всех привязанных комнат.
    roomCodes: Array.isArray(raw.roomCodes)
      ? [...new Set(raw.roomCodes.map((code) => String(code || '').trim()).filter(Boolean))]
      : [],
    keyAccessState: String(raw.keyAccessState || 'none'),
    keyUnlocked: Boolean(raw.keyUnlocked),
    closedByClientIds,
    revision: Math.max(1, Math.floor(Number(raw.revision) || 1)),
    openedAt: Number(raw.openedAt) || now,
    updatedAt: now,
  };
};

const getEffectiveMerchantRates = (session, characterId = null) => {
  const baseSale = normalizeSaleMarkupPercent(session?.saleMarkupPercent, 0);
  const baseDepr = normalizeBuyDepreciationPercent(session?.buyDepreciationPercent, 50);
  if (!characterId || !session?.characterOverrides?.[characterId]) {
    return {
      saleMarkupPercent: baseSale,
      buyDepreciationPercent: baseDepr,
      isPersonalOverride: false,
    };
  }
  const ov = session.characterOverrides[characterId];
  return {
    saleMarkupPercent: ov.saleMarkupPercent !== undefined
      ? normalizeSaleMarkupPercent(ov.saleMarkupPercent, baseSale)
      : baseSale,
    buyDepreciationPercent: ov.buyDepreciationPercent !== undefined
      ? normalizeBuyDepreciationPercent(ov.buyDepreciationPercent, baseDepr)
      : baseDepr,
    isPersonalOverride: true,
  };
};

const computeMerchantSellPriceToPlayer = (
  entry,
  { saleMarkupPercent = 0, capCollectorPercent = 0 } = {},
) => {
  const baseCost = effectiveItemCost(entry);
  if (baseCost <= 0) return 0;

  const itemMarkup = Number(entry?.markupPercent) || 0;
  const merchantMarkup = Number(saleMarkupPercent) || 0;
  const markupFactor = 1 + (itemMarkup + merchantMarkup) / 100;
  if (markupFactor <= 0) return 0;

  const perkDiscount = clampNumber(capCollectorPercent, 0, 100, 0);
  const rawPrice = baseCost * markupFactor * (1 - perkDiscount / 100);
  if (rawPrice <= 0) return 0;
  return Math.max(1, Math.round(rawPrice));
};

const computeMerchantBuybackPriceFromPlayer = (
  item,
  { buyDepreciationPercent = 50, capCollectorPercent = 0 } = {},
) => {
  const baseCost = effectiveItemCost(item);
  if (baseCost <= 0) return 0;

  const depreciation = normalizeBuyDepreciationPercent(buyDepreciationPercent, 50);
  if (depreciation >= 100) return 0;

  const perkBonus = clampNumber(capCollectorPercent, 0, 100, 0);
  const rawPrice = baseCost * (1 - depreciation / 100) * (1 + perkBonus / 100);
  return Math.max(0, Math.round(rawPrice));
};

const isCharacterAllowed = (session, characterId) => {
  if (!session) return false;
  if (session.targetType === 'room') return Boolean(characterId);
  return Boolean(characterId && session.targetCharacterId === String(characterId));
};

const applyMerchantRatePatch = (target, payload = {}) => {
  if (payload.caps !== undefined) {
    target.caps = normalizeCapsAmount(payload.caps, target.caps);
  }
  const targetCharId = payload.targetCharacterId ? String(payload.targetCharacterId) : null;
  if (targetCharId) {
    if (payload.resetCharacterOverride) {
      delete target.characterOverrides[targetCharId];
    } else {
      const prev = target.characterOverrides[targetCharId] || {};
      const updatedOv = { ...prev };
      if (payload.saleMarkupPercent !== undefined) {
        updatedOv.saleMarkupPercent = normalizeSaleMarkupPercent(
          payload.saleMarkupPercent,
          target.saleMarkupPercent,
        );
      }
      if (payload.buyDepreciationPercent !== undefined) {
        updatedOv.buyDepreciationPercent = normalizeBuyDepreciationPercent(
          payload.buyDepreciationPercent,
          target.buyDepreciationPercent,
        );
      }
      target.characterOverrides[targetCharId] = updatedOv;
    }
  } else {
    if (payload.saleMarkupPercent !== undefined) {
      target.saleMarkupPercent = normalizeSaleMarkupPercent(
        payload.saleMarkupPercent,
        target.saleMarkupPercent,
      );
    }
    if (payload.buyDepreciationPercent !== undefined) {
      target.buyDepreciationPercent = normalizeBuyDepreciationPercent(
        payload.buyDepreciationPercent,
        target.buyDepreciationPercent,
      );
    }
    if (payload.resetAllCharacterOverrides) {
      target.characterOverrides = {};
    }
  }
};

/**
 * Патч 523: «заблокировать всё» на ЛЮБОМ узле с детьми. Блокируются только
 * запираемые потомки; сам узел-инициатор остаётся как есть.
 */
const applySessionLockAll = (session, containerId) => {
  if (!session || session.kind !== 'hub') return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  const targetId = String(containerId || '').trim();
  const graph = locationGraph.buildGraphFromSession(session.containerId, session.nodes || []);
  if (targetId && targetId !== session.containerId && !graph.byId.has(targetId)) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  }
  const targets = new Set(locationGraph.lockAllTargets(graph, targetId || session.containerId));
  if (targets.size === 0) return { session };
  return {
    session: {
      ...session,
      nodes: (session.nodes || []).map((node) => (
        targets.has(node.containerId) ? { ...node, locked: true } : node
      )),
      revision: session.revision + 1,
      updatedAt: Date.now(),
    },
  };
};

/**
 * Патч 523: адресный взлом. Открывается РОВНО одна точка, каскада по детям и
 * по воротам нет. Ключ при этом может быть назначен многим точкам — каждая
 * открывается им независимо («поточечно»).
 */
const applySessionUnlock = (session, containerId) => {
  if (!session || session.kind !== 'hub') return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  const targetId = String(containerId || '').trim();
  if (!targetId) return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  const found = (session.nodes || []).some((node) => node.containerId === targetId);
  if (!found) return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  return {
    session: {
      ...session,
      nodes: locationGraph.addressableUnlock(session.nodes, targetId),
      revision: session.revision + 1,
      updatedAt: Date.now(),
    },
  };
};

/**
 * Живое обновление процентов/кассы/содержимого/замков открытой сессии Мастером.
 */
const applySessionUpdate = (session, payload = {}, now = Date.now()) => {
  if (!session) return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  if (payload.sessionId && String(payload.sessionId) !== session.sessionId) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  }

  const next = {
    ...session,
    characterOverrides: { ...(session.characterOverrides || {}) },
    items: (session.items || []).map((item) => ({ ...item })),
    nodes: Array.isArray(session.nodes)
      ? session.nodes.map((node) => ({
          ...node,
          characterOverrides: { ...(node.characterOverrides || {}) },
          items: (node.items || []).map((item) => ({ ...item })),
        }))
      : [],
    closedByClientIds: Array.isArray(session.closedByClientIds)
      ? [...session.closedByClientIds]
      : [],
    revision: session.revision + 1,
    updatedAt: now,
  };

  if (next.kind === 'hub') {
    // Патч 523: команды Мастера «заблокировать всё» и адресное открытие.
    if (payload.lockAll !== undefined) {
      const result = applySessionLockAll(next, payload.lockAll);
      if (result.error) return result;
      return { session: result.session };
    }
    if (payload.unlock !== undefined) {
      const result = applySessionUnlock(next, payload.unlock);
      if (result.error) return result;
      return { session: result.session };
    }
    if (payload.name !== undefined && String(payload.name).trim()) {
      next.name = String(payload.name).trim();
    }
    if (payload.description !== undefined) {
      next.description = String(payload.description || '').trim();
    }
    // Патч 542: живая правка корня локации переносит требование доступа и
    // особый выход в сессию, а не только имя/описание/узлы.
    if (payload.requiredKeyItemId !== undefined) {
      next.requiredKeyItemId = String(payload.requiredKeyItemId || '').trim();
    }
    if (payload.keyRequirement !== undefined) {
      next.keyRequirement = String(payload.keyRequirement || 'none');
    }
    if (payload.linkedCheckIds !== undefined || payload.linkedCheckId !== undefined) {
      next.linkedCheckIds = normalizeLinkedCheckIds(payload);
      next.linkedCheckId = String(payload.linkedCheckId || next.linkedCheckIds[0] || '').trim();
    }
    if (payload.accessExpression !== undefined) {
      next.accessExpression = normalizeAccessExpression(payload.accessExpression);
    }
    if (payload.exitLocationId !== undefined) {
      next.exitLocationId = String(payload.exitLocationId || '').trim();
    }

    if (Array.isArray(payload.nodes)) {
      // Сохраняем живые characterOverrides уже открытых торговцев при обновлении списка узлов
      const prevById = new Map(next.nodes.map((n) => [n.containerId, n]));
      next.nodes = normalizeHubSessionNodes(payload.nodes, now).map((node) => {
        const prev = prevById.get(node.containerId);
        if (prev && node.kind === 'merchant') {
          return {
            ...node,
            characterOverrides: Object.keys(node.characterOverrides || {}).length > 0
              ? node.characterOverrides
              : { ...(prev.characterOverrides || {}) },
          };
        }
        return node;
      });
    }

    if (payload.nodeContainerId) {
      const nodeId = String(payload.nodeContainerId);
      const idx = next.nodes.findIndex((n) => n.containerId === nodeId);
      if (idx >= 0) {
        const targetNode = {
          ...next.nodes[idx],
          characterOverrides: { ...(next.nodes[idx].characterOverrides || {}) },
          items: (next.nodes[idx].items || []).map((item) => ({ ...item })),
        };
        if (payload.nodeName !== undefined && String(payload.nodeName).trim()) {
          targetNode.name = String(payload.nodeName).trim();
        }
        if (payload.nodeDescription !== undefined) {
          targetNode.description = String(payload.nodeDescription || '').trim();
        }
        if (targetNode.kind === 'terminal' || targetNode.kind === 'lock') {
          if (payload.nodeDifficulty !== undefined) {
            targetNode.difficulty = Math.max(0, Math.min(5, Math.floor(Number(payload.nodeDifficulty) || 0)));
          }
        }
        if (payload.locked !== undefined) {
          targetNode.locked = Boolean(payload.locked);
        }
        if (payload.lockLabel !== undefined) {
          targetNode.lockLabel = String(payload.lockLabel || '').trim();
        }
        if (targetNode.kind === 'terminal') {
          const previousMarker = decodeTerminalNodeMarker(targetNode.lockLabel);
          targetNode.lockLabel = encodeTerminalNodeMarker({
            difficulty: targetNode.difficulty,
            label: previousMarker ? previousMarker.label : targetNode.lockLabel,
          });
        } else if (targetNode.kind === 'lock') {
          const previousMarker = decodeLockNodeMarker(targetNode.lockLabel);
          targetNode.lockLabel = encodeLockNodeMarker({
            difficulty: targetNode.difficulty,
            label: previousMarker ? previousMarker.label : targetNode.lockLabel,
          });
        }
        if (Array.isArray(payload.nodeItems)) {
          targetNode.items = normalizeSessionItemsList(payload.nodeItems, now, 0);
        }
        if (targetNode.kind === 'merchant') {
          applyMerchantRatePatch(targetNode, payload);
        }
        next.nodes[idx] = targetNode;
      }
    }

    return { session: next };
  }

  if (Array.isArray(payload.items)) {
    next.items = normalizeSessionItemsList(payload.items, now, 0);
  }

  if (payload.name !== undefined && String(payload.name).trim()) {
    next.name = String(payload.name).trim();
  }
  if (payload.description !== undefined) {
    next.description = String(payload.description || '').trim();
  }

  if (next.kind === 'merchant') {
    applyMerchantRatePatch(next, payload);
  }

  return { session: next };
};

const deductLootItems = (itemsList, takes) => {
  const nextItems = (itemsList || []).map((entry) => ({ ...entry }));
  const granted = [];

  for (const req of takes) {
    const entryId = String(req?.entryId || '');
    const wanted = Math.floor(Number(req?.quantity) || 0);
    if (!entryId || wanted <= 0) continue;
    const idx = nextItems.findIndex((entry) => entry.entryId === entryId && entry.quantity > 0);
    if (idx < 0) continue;
    const current = nextItems[idx];
    const actual = Math.min(wanted, current.quantity);
    if (actual <= 0) continue;
    granted.push({
      ...current,
      quantity: actual,
    });
    current.quantity -= actual;
  }

  return {
    granted,
    remaining: nextItems.filter((entry) => entry.quantity > 0),
  };
};

/**
 * Патч 544: серверная граница доступа. Узел считается закрытым не только когда
 * заперт он сам, но и когда он лежит за запертой/перекрытой локацией-родителем.
 * Клиентский фильтр списка не является защитой: прямой WS-запрос тоже проверяется.
 */
const isNodeBehindSessionBarrier = (session, nodeId) => {
  if (!session || session.kind !== 'hub') return false;
  const nodes = Array.isArray(session.nodes) ? session.nodes : [];
  const graph = locationGraph.buildGraphFromSession(session.containerId, nodes);
  // Патч 546: граница — запертый узел ИЛИ узел с непройденной проверкой.
  const lockedIds = nodes
    .filter((node) => accessBarrierPending(node))
    .map((node) => node.containerId);
  if (accessBarrierPending(session)) lockedIds.push(session.containerId);
  const hidden = new Set(locationGraph.hiddenBehindLock(graph, {
    lockedIds,
    isGm: false,
    rootId: session.containerId,
  }));
  return hidden.has(String(nodeId || '').trim());
};

/**
 * Атомарное взятие предметов игроком из контейнера добычи (или вложенного узла локации).
 */
const applyAtomicLootTake = (session, payload = {}, now = Date.now()) => {
  if (!session || (session.kind !== 'loot' && session.kind !== 'hub')) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  }
  // Патч 516: без требуемого ключа точку нельзя ни открыть, ни обобрать.
  // Патч 546: непройденная проверка входа — такая же преграда, как locked.
  if (accessBarrierPending(session)) {
    return { error: session.keyAccessState !== 'none' ? ERROR_CODE.KEY_REQUIRED : ERROR_CODE.CONTAINER_LOCKED, session };
  }
  if (payload.sessionId && String(payload.sessionId) !== session.sessionId) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  }
  const characterId = String(payload.characterId || '');
  if (!isCharacterAllowed(session, characterId)) {
    return { error: ERROR_CODE.SESSION_FORBIDDEN };
  }

  const takes = Array.isArray(payload.takes) ? payload.takes : [];

  if (session.kind === 'hub') {
    const nodeId = String(payload.nodeContainerId || '');
    const nodeIdx = (session.nodes || []).findIndex(
      (n) => n.containerId === nodeId && n.kind === 'loot',
    );
    if (nodeIdx < 0) {
      return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
    }
    const targetNode = session.nodes[nodeIdx];
    if (accessBarrierPending(targetNode) || isNodeBehindSessionBarrier(session, targetNode.containerId)) {
      return { error: ERROR_CODE.CONTAINER_LOCKED, session };
    }

    const hadItemsBefore = Array.isArray(targetNode.items) && targetNode.items.length > 0;
    const { granted, remaining } = deductLootItems(targetNode.items, takes);
    const nextNodes = session.nodes.map((node, idx) => (
      idx === nodeIdx ? { ...node, items: remaining } : node
    ));
    const emptiedNodeContainerId = (hadItemsBefore || granted.length > 0) && remaining.length === 0
      ? targetNode.containerId
      : null;

    const nextSession = {
      ...session,
      nodes: nextNodes,
      closedByClientIds: Array.isArray(session.closedByClientIds)
        ? [...session.closedByClientIds]
        : [],
      revision: session.revision + 1,
      updatedAt: now,
    };

    return {
      granted,
      emptiedNodeContainerId,
      session: nextSession,
    };
  }

  const { granted, remaining } = deductLootItems(session.items, takes);
  const nextSession = {
    ...session,
    items: remaining,
    closedByClientIds: Array.isArray(session.closedByClientIds)
      ? [...session.closedByClientIds]
      : [],
    revision: session.revision + 1,
    updatedAt: now,
  };

  return {
    granted,
    emptiedNodeContainerId: null,
    session: nextSession,
  };
};

/**
 * Атомарная бартерная сделка игрока с торговцем (или вложенным торговцем локации).
 */
const applyAtomicTradeCommit = (session, payload = {}, now = Date.now()) => {
  if (!session || (session.kind !== 'merchant' && session.kind !== 'hub')) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  }
  // Патч 516: торговля закрыта, пока не добыт обязательный ключ или не
  // пройдена привязанная проверка.
  // Патч 546: единый предикат преграды вместо одного флага locked.
  if (accessBarrierPending(session)) {
    return { error: session.keyAccessState !== 'none' ? ERROR_CODE.KEY_REQUIRED : ERROR_CODE.CONTAINER_LOCKED, session };
  }
  if (payload.sessionId && String(payload.sessionId) !== session.sessionId) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
  }
  const characterId = String(payload.characterId || '');
  if (!isCharacterAllowed(session, characterId)) {
    return { error: ERROR_CODE.SESSION_FORBIDDEN };
  }

  let merchantTarget = session;
  let hubNodeIdx = -1;
  if (session.kind === 'hub') {
    const nodeId = String(payload.nodeContainerId || '');
    hubNodeIdx = (session.nodes || []).findIndex(
      (n) => n.containerId === nodeId && n.kind === 'merchant',
    );
    if (hubNodeIdx < 0) {
      return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
    }
    merchantTarget = session.nodes[hubNodeIdx];
    if (accessBarrierPending(merchantTarget) || isNodeBehindSessionBarrier(session, merchantTarget.containerId)) {
      return { error: ERROR_CODE.CONTAINER_LOCKED, session };
    }
  }

  const buyRequests = Array.isArray(payload.buyItems) ? payload.buyItems : [];
  const sellRequests = Array.isArray(payload.sellItems) ? payload.sellItems : [];
  if (buyRequests.length === 0 && sellRequests.length === 0) {
    return { error: ERROR_CODE.BAD_MESSAGE };
  }

  const rates = getEffectiveMerchantRates(merchantTarget, characterId);
  const capCollectorPercent = clampNumber(payload.perkCapCollectorPercent, 0, 100, 0);
  const playerCapsAvailable = normalizeCapsAmount(payload.playerCapsAvailable, 0);
  const acceptCapShortfall = Boolean(payload.acceptCapShortfall);

  const nextItems = merchantTarget.items.map((entry) => ({ ...entry }));
  const boughtEntries = [];
  let totalBuyCost = 0;

  // 1. Проверяем остатки всех покупаемых позиций ДО любой мутации.
  for (const req of buyRequests) {
    const entryId = String(req?.entryId || '');
    const qty = Math.floor(Number(req?.quantity) || 0);
    if (!entryId || qty <= 0) continue;
    const idx = nextItems.findIndex((entry) => entry.entryId === entryId);
    if (idx < 0 || nextItems[idx].quantity < qty) {
      return { error: ERROR_CODE.TRADE_STOCK_CHANGED, session };
    }
    const entry = nextItems[idx];
    const unitPrice = computeMerchantSellPriceToPlayer(entry, {
      saleMarkupPercent: rates.saleMarkupPercent,
      capCollectorPercent,
    });
    totalBuyCost += unitPrice * qty;
    entry.quantity -= qty;
    boughtEntries.push({
      ...entry,
      quantity: qty,
      unitPrice,
    });
  }

  // 2. Считаем скупку предметов игрока.
  const soldItems = [];
  let totalSellValue = 0;

  for (let i = 0; i < sellRequests.length; i += 1) {
    const rawSell = sellRequests[i];
    const qty = Math.floor(Number(rawSell?.quantity) || 0);
    if (!rawSell || qty <= 0) continue;
    const normalized = normalizeSessionItem(
      {
        ...rawSell,
        quantity: qty,
        markupPercent: 0,
      },
      now,
      i,
    );
    if (!normalized) continue;
    const unitPrice = computeMerchantBuybackPriceFromPlayer(normalized, {
      buyDepreciationPercent: rates.buyDepreciationPercent,
      capCollectorPercent,
    });
    totalSellValue += unitPrice * qty;
    soldItems.push({
      clientItemId: String(rawSell.clientItemId || ''),
      entry: normalized,
      quantity: qty,
      unitPrice,
    });
  }

  const netDelta = totalSellValue - totalBuyCost;
  const playerOwes = netDelta < 0 ? Math.abs(netDelta) : 0;
  const merchantOwes = netDelta > 0 ? netDelta : 0;

  if (playerOwes > playerCapsAvailable) {
    return { error: ERROR_CODE.TRADE_NOT_ENOUGH_PLAYER_CAPS, session };
  }

  if (merchantOwes > merchantTarget.caps && !acceptCapShortfall) {
    return {
      error: ERROR_CODE.TRADE_NOT_ENOUGH_MERCHANT_CAPS,
      merchantCaps: merchantTarget.caps,
      owedCaps: merchantOwes,
      session,
    };
  }

  const actualMerchantPayout = Math.min(merchantOwes, merchantTarget.caps);
  const nextMerchantCaps = merchantTarget.caps + playerOwes - actualMerchantPayout;
  const playerCapsDelta = actualMerchantPayout - playerOwes;

  // 3. Применяем изменения к ассортименту торговца (проданные игроком вещи ложатся в лавку).
  const remaining = nextItems.filter((entry) => entry.quantity > 0);
  for (const sold of soldItems) {
    addOrMergeSessionItem(remaining, sold.entry, now);
  }

  const nextSession = session.kind === 'hub'
    ? {
        ...session,
        nodes: session.nodes.map((node, idx) => (
          idx === hubNodeIdx
            ? {
                ...node,
                caps: nextMerchantCaps,
                items: remaining,
              }
            : node
        )),
        revision: session.revision + 1,
        updatedAt: now,
      }
    : {
        ...session,
        caps: nextMerchantCaps,
        items: remaining,
        revision: session.revision + 1,
        updatedAt: now,
      };

  return {
    committed: {
      nodeContainerId: session.kind === 'hub' ? merchantTarget.containerId : null,
      boughtEntries,
      soldItems: soldItems.map((s) => ({
        clientItemId: s.clientItemId,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        name: s.entry.name,
      })),
      totalBuyCost,
      totalSellValue,
      playerCapsDelta,
      capShortfallAccepted: Math.max(0, merchantOwes - actualMerchantPayout),
      merchantCapsAfter: nextMerchantCaps,
    },
    session: nextSession,
  };
};

module.exports = {
  normalizeSaleMarkupPercent,
  normalizeBuyDepreciationPercent,
  normalizeCapsAmount,
  normalizeActiveSession,
  sanitizeSessionForMember,
  getEffectiveMerchantRates,
  computeMerchantSellPriceToPlayer,
  computeMerchantBuybackPriceFromPlayer,
  applySessionUpdate,
  applySessionLockAll,
  applySessionUnlock,
  applyAtomicLootTake,
  applyAtomicTradeCommit,
  applyKeyAccessToSession,
};
