'use strict';

// server/lootTradeSession.js
// Атомарная серверная механика выдачи контейнеров добычи и торговли в комнате Мастера.
// Живёт внутри server/, чтобы лёгкий деплой NetAngels (app/server + ws) работал автономно
// без сборки фронтенда. Формулы цен 1-в-1 совпадают с domain/lootTrade.js (проверяется тестом).

const { ERROR_CODE } = require('./protocol');

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

const snapshotMergeSignature = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return 'plain';
  const mods = snapshot.appliedMods && typeof snapshot.appliedMods === 'object'
    ? JSON.stringify(Object.entries(snapshot.appliedMods).sort(([a], [b]) => a.localeCompare(b)))
    : '';
  const dur = snapshot.durabilityTracked ? `dur:${snapshot.durability ?? 100}` : '';
  const charges = snapshot.charges != null ? `chg:${snapshot.charges}` : '';
  const hp = snapshot.hpCurrent != null ? `hp:${snapshot.hpCurrent}` : '';
  return `${mods}|${dur}|${charges}|${hp}`;
};

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
    cost: Math.max(0, Number(raw.cost ?? raw.price ?? 0) || 0),
    weight: Math.max(0, Number(String(raw.weight ?? 0).replace(',', '.')) || 0),
    quantity,
    markupPercent: normalizeSaleMarkupPercent(raw.markupPercent, 0),
    itemSnapshot: raw.itemSnapshot && typeof raw.itemSnapshot === 'object'
      ? { ...raw.itemSnapshot }
      : null,
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

const normalizeHubSessionNode = (raw, now = Date.now(), nodeIdx = 0) => {
  if (!raw || typeof raw !== 'object') return null;
  const containerId = String(raw.containerId || raw.id || '').trim();
  if (!containerId) return null;
  const kind = raw.kind === 'merchant' ? 'merchant' : 'loot';
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item, idx) => normalizeSessionItem(item, now, nodeIdx * 1000 + idx))
        .filter(Boolean)
    : [];
  return {
    containerId,
    kind,
    name: String(raw.name || '').trim() || (kind === 'merchant' ? 'Торговец' : 'Контейнер'),
    description: String(raw.description || '').trim(),
    locked: Boolean(raw.locked),
    lockLabel: String(raw.lockLabel || '').trim(),
    caps: kind === 'merchant' ? normalizeCapsAmount(raw.caps, 0) : 0,
    saleMarkupPercent: kind === 'merchant' ? normalizeSaleMarkupPercent(raw.saleMarkupPercent, 0) : 0,
    buyDepreciationPercent: kind === 'merchant'
      ? normalizeBuyDepreciationPercent(raw.buyDepreciationPercent, 50)
      : 50,
    characterOverrides: kind === 'merchant' ? normalizeCharacterOverrides(raw.characterOverrides) : {},
    items,
  };
};

const normalizeHubSessionNodes = (rawNodes, now = Date.now()) => {
  if (!Array.isArray(rawNodes)) return [];
  const seen = new Set();
  const out = [];
  rawNodes.forEach((raw, idx) => {
    const node = normalizeHubSessionNode(raw, now, idx);
    if (!node || seen.has(node.containerId)) return;
    seen.add(node.containerId);
    out.push(node);
  });
  return out;
};

/**
 * Скрывает содержимое и кассу запертых (locked: true) вложенных контейнеров/торговцев
 * от игроков по WebSocket. Мастер получает полное состояние без купюр.
 */
const sanitizeSessionForMember = (session, { isGm = false } = {}) => {
  if (!session || isGm || session.kind !== 'hub') return session;
  return {
    ...session,
    nodes: (session.nodes || []).map((node) => {
      if (!node.locked) return node;
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

const normalizeActiveSession = (raw, now = Date.now()) => {
  if (!raw || typeof raw !== 'object') return null;
  let kind = 'loot';
  if (raw.kind === 'merchant') kind = 'merchant';
  else if (raw.kind === 'hub') kind = 'hub';

  const targetType = raw.targetType === 'character' ? 'character' : 'room';
  const targetCharacterId = targetType === 'character' && raw.targetCharacterId
    ? String(raw.targetCharacterId)
    : null;
  if (targetType === 'character' && !targetCharacterId) return null;

  const items = kind === 'hub'
    ? []
    : (Array.isArray(raw.items)
        ? raw.items.map((item, idx) => normalizeSessionItem(item, now, idx)).filter(Boolean)
        : []);
  const nodes = kind === 'hub' ? normalizeHubSessionNodes(raw.nodes, now) : [];
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
    items,
    nodes,
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
  const baseCost = Math.max(0, Number(entry?.cost ?? entry?.price ?? 0) || 0);
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
  const baseCost = Math.max(0, Number(item?.cost ?? item?.price ?? 0) || 0);
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
    if (payload.name !== undefined && String(payload.name).trim()) {
      next.name = String(payload.name).trim();
    }
    if (payload.description !== undefined) {
      next.description = String(payload.description || '').trim();
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
        if (payload.locked !== undefined) {
          targetNode.locked = Boolean(payload.locked);
        }
        if (payload.lockLabel !== undefined) {
          targetNode.lockLabel = String(payload.lockLabel || '').trim();
        }
        if (Array.isArray(payload.nodeItems)) {
          targetNode.items = payload.nodeItems
            .map((item, itemIdx) => normalizeSessionItem(item, now, itemIdx))
            .filter(Boolean);
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
    next.items = payload.items
      .map((item, idx) => normalizeSessionItem(item, now, idx))
      .filter(Boolean);
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
    const idx = nextItems.findIndex((entry) => entry.entryId === entryId);
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
 * Атомарное взятие предметов игроком из контейнера добычи (или вложенного узла локации).
 */
const applyAtomicLootTake = (session, payload = {}, now = Date.now()) => {
  if (!session || (session.kind !== 'loot' && session.kind !== 'hub')) {
    return { error: ERROR_CODE.SESSION_NOT_ACTIVE };
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
    if (targetNode.locked) {
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
    if (merchantTarget.locked) {
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
  applyAtomicLootTake,
  applyAtomicTradeCommit,
};
