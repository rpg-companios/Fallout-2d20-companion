// domain/lootTrade.js
// Доменная модель и чистая математика раздела Мастера «Добыча/Торговля»:
// - два типа карточек: 'loot' (контейнер добычи) и 'merchant' (торговец);
// - немедленный бросок количества (шт. / CD / d20) при сохранении позиции;
// - формула специализации торговца: (наценка товара + наценка торговца) + автоучёт перков;
// - формула обесценивания скупки (по умолчанию 50%, без ввода знака минус) + автоучёт перков;
// - расчёт двухпанельного буфера обмена с контролем лимита крышек торговца;
// - дублирование контейнеров и слияние одинаковых позиций.

import itemStacking from './itemStacking.js';
import locationGraph from './locationGraph.js';
import { withLocationNodeMarker } from './locationNodeMarker.js';
import {
  normalizeAccessExpression,
  expressionCheckIds,
  resolveAccessExpression,
} from './accessExpression.js';
import { rollMultipleCombatDice, rollCustomDice } from './diceRollsLogic';
import {
  AMMO_FOUND_BY_ID,
  isAmmoItem,
  getAmmoFoundSpec,
  formatAmmoFoundFormula,
} from './ammoFoundTable';

export {
  AMMO_FOUND_BY_ID,
  isAmmoItem,
  getAmmoFoundSpec,
  formatAmmoFoundFormula,
};

export const CONTAINER_KIND = Object.freeze({
  LOOT: 'loot',
  MERCHANT: 'merchant',
  HUB: 'hub',
  TERMINAL: 'terminal',
  // Патч 520: мини-игра взлома замков — пятый вид точки. Может выдаваться
  // отдельно, жить внутри локации и быть преградой для другой точки.
  LOCK: 'lock',
});

// Патч 514 резервировал имя; патч 520 сделал его полноценным видом точки.
// Алиас сохранён для старых импортов и тестов.
export const RESERVED_LOCK_KIND = CONTAINER_KIND.LOCK;

/**
 * Патч 520: вторая строка требования доступа — список источников через «ИЛИ».
 * Терминал и замок не блокируют точку одновременно: достаточно любого из них.
 * `linkedCheckId` остаётся legacy-полем (первый выбранный источник), чтобы
 * карточки 516–519 продолжали работать без миграции. Максимум две строки.
 */
export const normalizeLinkedCheckIds = (raw = {}) => {
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

/** Обязательность ключа для точки доступа. */
export const KEY_REQUIREMENT = Object.freeze({
  NONE: 'none',
  OPTIONAL: 'optional',
  REQUIRED: 'required',
});

/** Ключ можно вложить в локацию, контейнер или торговца, но НЕ в терминал. */
export const containerCanHoldKey = (kind) => (
  kind === CONTAINER_KIND.HUB
  || kind === CONTAINER_KIND.LOOT
  || kind === CONTAINER_KIND.MERCHANT
);

/** Точка, которая может требовать ключ: контейнер, торговец, терминал, замок. */
export const containerCanRequireKey = (kind) => (
  kind === CONTAINER_KIND.HUB
  || kind === CONTAINER_KIND.LOOT
  || kind === CONTAINER_KIND.MERCHANT
  || kind === CONTAINER_KIND.TERMINAL
  || kind === RESERVED_LOCK_KIND
);

export const normalizeKeyItemIds = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  return list
    .map((id) => String(id || '').trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

export const normalizeKeyRequirement = (raw) => {
  if (raw === KEY_REQUIREMENT.REQUIRED || raw === true) return KEY_REQUIREMENT.REQUIRED;
  if (raw === KEY_REQUIREMENT.OPTIONAL) return KEY_REQUIREMENT.OPTIONAL;
  return KEY_REQUIREMENT.NONE;
};

/**
 * Маркер терминала внутри узла локации.
 *
 * `normalizeHubSessionNode()` на сервере (особенно на ещё не обновлённом)
 * собирает узел заново и выбрасывает все неизвестные поля: `kind: 'terminal'`
 * превращается в `'loot'`, а `difficulty` теряется. Из-за этого
 * игрок видел терминал как обычный сундук. `lockLabel` — единственное поле,
 * которое сервер сохраняет как есть и которое не показывается для незапертых
 * узлов, поэтому конфигурация терминала едет в нём. Клиент и обновлённый
 * сервер умеют восстановить из маркера настоящий тип узла.
 * Формат обязан совпадать с `server/terminalHacking.js` (CJS-копия).
 */
export const TERMINAL_NODE_MARKER = 'F2D20-TERM:';

// Патч 504: поле `f` («блокировать после провала») больше не пишется —
// решение о повторном взломе принимает Мастер. Старые маркеры с `f`
// читаются как прежде, но это поле игнорируется.
export const encodeTerminalNodeMarker = ({ difficulty = 0, label = '' } = {}) => (
  `${TERMINAL_NODE_MARKER}${JSON.stringify({
    v: 1,
    d: Math.max(0, Math.min(5, Math.floor(Number(difficulty) || 0))),
    l: String(label || ''),
  })}`
);

export const decodeTerminalNodeMarker = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith(TERMINAL_NODE_MARKER)) return null;
  try {
    const parsed = JSON.parse(raw.slice(TERMINAL_NODE_MARKER.length));
    if (!parsed || parsed.v !== 1) return null;
    return {
      difficulty: Math.max(0, Math.min(5, Math.floor(Number(parsed.d) || 0))),
      label: String(parsed.l || ''),
    };
  } catch {
    return null;
  }
};

export const withTerminalNodeMarker = (node) => ({
  ...node,
  lockLabel: encodeTerminalNodeMarker({
    difficulty: node?.difficulty,
    label: node?.lockLabel,
  }),
});

// Патч 520: свой маркер для замка. Старый сервер комнат понижает неизвестный
// kind до 'loot', но lockLabel сохраняет как есть — этого достаточно, чтобы
// клиент восстановил тип точки и её сложность. Формат повторяет терминальный.
export const LOCK_NODE_MARKER = 'F2D20-LOCK:';

export const encodeLockNodeMarker = ({ difficulty = 0, label = '' } = {}) => (
  `${LOCK_NODE_MARKER}${JSON.stringify({
    v: 1,
    d: Math.max(0, Math.min(5, Math.floor(Number(difficulty) || 0))),
    l: String(label || ''),
  })}`
);

export const decodeLockNodeMarker = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith(LOCK_NODE_MARKER)) return null;
  try {
    const parsed = JSON.parse(raw.slice(LOCK_NODE_MARKER.length));
    if (!parsed || parsed.v !== 1) return null;
    return {
      difficulty: Math.max(0, Math.min(5, Math.floor(Number(parsed.d) || 0))),
      label: String(parsed.l || ''),
    };
  } catch {
    return null;
  }
};

export const withLockNodeMarker = (node) => ({
  ...node,
  lockLabel: encodeLockNodeMarker({
    difficulty: node?.difficulty,
    label: node?.lockLabel,
  }),
});

/** Восстановление узла: терминал, замок или обычная точка. */
export const resolveCheckSessionNode = (node) => {
  const terminal = resolveTerminalSessionNode(node);
  if (terminal.isTerminal) return { ...terminal, isLock: false, checkKind: CONTAINER_KIND.TERMINAL };
  const marker = decodeLockNodeMarker(node?.lockLabel);
  if (node?.kind === CONTAINER_KIND.LOCK || marker) {
    return {
      node: marker
        ? {
            ...node,
            kind: CONTAINER_KIND.LOCK,
            difficulty: marker.difficulty,
            lockLabel: marker.label,
          }
        : node,
      isTerminal: false,
      isLock: true,
      checkKind: CONTAINER_KIND.LOCK,
      marker,
    };
  }
  return { ...terminal, isLock: false, checkKind: null };
};

/** Восстанавливает узел терминала даже если сервер понизил его до сундука. */
export const resolveTerminalSessionNode = (node) => {
  if (!node) return { node, isTerminal: false, marker: null };
  const marker = decodeTerminalNodeMarker(node.lockLabel);
  if (node.kind === CONTAINER_KIND.TERMINAL) {
    return {
      node: marker ? { ...node, lockLabel: marker.label } : node,
      isTerminal: true,
      marker,
    };
  }
  if (!marker) return { node, isTerminal: false, marker: null };
  return {
    node: {
      ...node,
      kind: CONTAINER_KIND.TERMINAL,
      difficulty: marker.difficulty,
      lockLabel: marker.label,
    },
    isTerminal: true,
    marker,
  };
};

/** Отдельный терминал, выданный без локации (старый сервер не знает terminal.issue). */
export const buildStandaloneTerminalSessionNode = (container, { locked = false, lockLabel = '' } = {}) => withTerminalNodeMarker({
  containerId: container?.id,
  kind: CONTAINER_KIND.TERMINAL,
  name: container?.name || '',
  description: container?.description || '',
  locked,
  lockLabel,
  difficulty: container?.difficulty || 0,
  requiredKeyItemId: String(container?.requiredKeyItemId || '').trim(),
  keyRequirement: String(container?.keyRequirement || 'none'),
  linkedCheckId: String(container?.linkedCheckId || '').trim(),
  items: [],
});

export const QUANTITY_UNIT = Object.freeze({
  PCS: 'pcs',
  CD: 'cd',
  D20: 'd20',
  PACKS: 'packs',
});

export const DEFAULT_MERCHANT_CAPS = 200;
export const DEFAULT_SALE_MARKUP_PERCENT = 0;
export const DEFAULT_BUY_DEPRECIATION_PERCENT = 50;

export const makeContainerId = (now = Date.now(), rand = Math.random().toString(36).slice(2, 9)) =>
  `cnt_${now}_${rand}`;

export const makeEntryId = (now = Date.now(), rand = Math.random().toString(36).slice(2, 9)) =>
  `ent_${now}_${rand}`;

export const clampNumber = (val, min, max, fallback = 0) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export const normalizeSaleMarkupPercent = (value, fallback = DEFAULT_SALE_MARKUP_PERCENT) => {
  if (value === '' || value === null || value === undefined) return fallback;
  return Math.round(clampNumber(value, -100, 1000, fallback));
};

export const normalizeBuyDepreciationPercent = (value, fallback = DEFAULT_BUY_DEPRECIATION_PERCENT) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(clampNumber(Math.abs(num), 0, 100, fallback));
};

export const normalizeCapsAmount = (value, fallback = 0) =>
  Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback));

/**
 * Немедленное вычисление количества при сохранении позиции или кассы торговца:
 * - 'pcs'   (шт.)   — точное число;
 * - 'cd'    (CD)    — бросок N боевых костей Fallout 2d20 (0..2 за кость);
 * - 'd20'   (d20)   — сумма N бросков d20 (Nd20);
 * - 'packs' (пачки) — выдача патронов пачками по таблице нахождения (base + cd за пачку).
 */
export const resolveQuantitySpec = (
  { count = 1, unit = QUANTITY_UNIT.PCS, item = null, allowZeroPcs = false } = {},
  deps = {},
) => {
  const validUnits = [
    QUANTITY_UNIT.PCS,
    QUANTITY_UNIT.CD,
    QUANTITY_UNIT.D20,
    QUANTITY_UNIT.PACKS,
  ];
  const normalizedUnit = validUnits.includes(unit) ? unit : QUANTITY_UNIT.PCS;
  const parsedCount = Math.floor(Number(count));

  if (normalizedUnit === QUANTITY_UNIT.PCS) {
    const minVal = allowZeroPcs ? 0 : 1;
    const quantity = Number.isFinite(parsedCount) ? Math.max(minVal, parsedCount) : minVal;
    return {
      quantity,
      rolled: false,
      unit: QUANTITY_UNIT.PCS,
      diceCount: 0,
      rolls: [],
      effects: 0,
    };
  }

  if (normalizedUnit === QUANTITY_UNIT.PACKS) {
    const packCount = Number.isFinite(parsedCount) && parsedCount >= 1
      ? Math.min(100, parsedCount)
      : 1;
    const spec = getAmmoFoundSpec(item);
    const baseTotal = packCount * spec.base;
    const diceCount = packCount * spec.cd;
    let cdTotal = 0;
    let rolls = [];
    let effects = 0;

    if (diceCount > 0) {
      const rollCd = deps.rollCombatDice || rollMultipleCombatDice;
      const res = rollCd(diceCount);
      cdTotal = Math.max(0, Math.floor(Number(res?.total) || 0));
      rolls = Array.isArray(res?.rolls) ? res.rolls : [];
      effects = Math.max(0, Math.floor(Number(res?.effects) || 0));
    }

    const total = Math.max(1, baseTotal + cdTotal);
    return {
      quantity: total,
      rolled: true,
      unit: QUANTITY_UNIT.PACKS,
      packCount,
      packSpec: spec,
      formula: formatAmmoFoundFormula(spec),
      totalFormula: formatAmmoFoundFormula({ base: baseTotal, cd: diceCount }),
      diceCount,
      rolls,
      effects,
    };
  }

  const diceCount = Number.isFinite(parsedCount) && parsedCount >= 1 ? Math.min(100, parsedCount) : 1;

  if (normalizedUnit === QUANTITY_UNIT.CD) {
    const rollCd = deps.rollCombatDice || rollMultipleCombatDice;
    const res = rollCd(diceCount);
    const total = Math.max(0, Math.floor(Number(res?.total) || 0));
    return {
      quantity: total,
      rolled: true,
      unit: QUANTITY_UNIT.CD,
      diceCount,
      rolls: Array.isArray(res?.rolls) ? res.rolls : [],
      effects: Math.max(0, Math.floor(Number(res?.effects) || 0)),
    };
  }

  // Бросок Nd20: поддерживаем как инъекцию deps.rollD20 (число либо { total, rolls }),
  // так и поштучный бросок N костей d20 с честным суммированием всех выпавших граней.
  if (typeof deps.rollD20 === 'function') {
    const res = deps.rollD20(diceCount);
    const numericRes = typeof res === 'number' ? res : Number(res?.total);
    const rolls = Array.isArray(res?.rolls) ? res.rolls : [];
    const rollsSum = rolls.length > 0
      ? rolls.reduce((acc, v) => acc + (Number(v) || 0), 0)
      : diceCount;
    const total = Math.max(
      diceCount,
      Math.floor(Number.isFinite(numericRes) && numericRes > 0 ? numericRes : rollsSum),
    );
    return {
      quantity: total,
      rolled: true,
      unit: QUANTITY_UNIT.D20,
      diceCount,
      rolls,
      effects: 0,
    };
  }

  const rollSingleD20 = deps.rollSingleD20 || (() => Number(rollCustomDice('1d20')) || 1);
  const rolls = [];
  let sum = 0;
  for (let i = 0; i < diceCount; i += 1) {
    const face = clampNumber(Math.floor(Number(rollSingleD20(i)) || 1), 1, 20, 1);
    rolls.push(face);
    sum += face;
  }
  return {
    quantity: sum,
    rolled: true,
    unit: QUANTITY_UNIT.D20,
    diceCount,
    rolls,
    effects: 0,
  };
};

/**
 * Нормализация одной строки предмета внутри контейнера/торговца.
 */
export const normalizeContainerItem = (raw, now = Date.now()) => {
  if (!raw || typeof raw !== 'object') return null;
  const itemType = String(raw.itemType || 'misc');
  const itemId = String(raw.itemId || raw.id || raw.weaponId || (itemType === 'caps' ? 'caps' : ''));
  const name = String(raw.name || '').trim();
  if (!name && itemType !== 'caps') return null;
  const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
  if (quantity <= 0) return null;

  return {
    entryId: String(raw.entryId || makeEntryId(now)),
    itemId: itemId || name,
    itemType,
    name: name || 'Крышки',
    cost: itemStacking.effectiveItemCost(raw),
    weight: itemStacking.effectiveItemWeight(raw),
    quantity,
    markupPercent: normalizeSaleMarkupPercent(raw.markupPercent, 0),
    itemSnapshot: raw.itemSnapshot && typeof raw.itemSnapshot === 'object'
      ? { ...raw.itemSnapshot }
      : null,
  };
};

/**
 * Нормализация одной ссылки на вложенный контейнер/торговца внутри локации ('hub').
 */
export const normalizeHubLink = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const containerId = String(raw.containerId || raw.id || '').trim();
  if (!containerId) return null;
  return {
    containerId,
    locked: Boolean(raw.locked),
    lockLabel: String(raw.lockLabel || '').trim(),
  };
};

export const normalizeHubLinks = (rawLinks = []) => {
  if (!Array.isArray(rawLinks)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawLinks) {
    const link = normalizeHubLink(raw);
    if (!link || seen.has(link.containerId)) continue;
    seen.add(link.containerId);
    out.push(link);
  }
  return out;
};

/**
 * Нормализация списка кодов комнат (локация может быть привязана сразу к нескольким комнатам).
 */
export const normalizeRoomCodes = (rawRoomCodes, fallbackRoomCode = '') => {
  const candidates = [];
  if (Array.isArray(rawRoomCodes)) {
    for (const c of rawRoomCodes) candidates.push(c);
  } else if (typeof rawRoomCodes === 'string' && rawRoomCodes.trim()) {
    candidates.push(rawRoomCodes);
  }
  if (fallbackRoomCode) candidates.push(fallbackRoomCode);

  const seen = new Set();
  const out = [];
  for (const item of candidates) {
    const code = String(item || '').trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
};

export const CONTAINER_KIND_SORT_ORDER = Object.freeze({
  [CONTAINER_KIND.HUB]: 0,
  [CONTAINER_KIND.LOOT]: 1,
  [CONTAINER_KIND.TERMINAL]: 2,
  [CONTAINER_KIND.LOCK]: 3,
  [CONTAINER_KIND.MERCHANT]: 4,
});

/**
 * Сортировка карточек на главном экране «Добыча/Торговля»:
 * 1) Локации ('hub') -> 2) Сундуки ('loot') -> 3) Торговцы ('merchant'),
 * а внутри каждой группы — по алфавиту названия.
 */
export const sortContainersForRoot = (containers = []) => {
  if (!Array.isArray(containers)) return [];
  return [...containers].sort((a, b) => {
    const rankA = CONTAINER_KIND_SORT_ORDER[a?.kind] ?? 99;
    const rankB = CONTAINER_KIND_SORT_ORDER[b?.kind] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    const nameCmp = String(a?.name || '').localeCompare(String(b?.name || ''), 'ru', {
      sensitivity: 'base',
    });
    if (nameCmp !== 0) return nameCmp;
    return (Number(a?.createdAt) || 0) - (Number(b?.createdAt) || 0);
  });
};

/**
 * Список id всех локаций ('hub'), в которых числится данный контейнер/торговец.
 */
export const getHubIdsContainingChild = (childId, allContainers = []) => {
  const targetId = String(childId || '').trim();
  if (!targetId || !Array.isArray(allContainers)) return [];
  const hubIds = [];
  for (const c of allContainers) {
    if (!c || c.kind !== CONTAINER_KIND.HUB) continue;
    if ((c.links || []).some((lnk) => lnk?.containerId === targetId)) {
      hubIds.push(c.id);
    }
  }
  return hubIds;
};

/**
 * Определяет, показывается ли карточка на корневом экране «Добыча/Торговля»:
 * - локация ('hub') без родителя — на корневом экране;
 * - патч 540: вложенная локация (есть parentLocationId) живёт ТОЛЬКО внутри
 *   родителя и на корне не показывается — как папка, вложенная в папку. Если
 *   родитель исчез (удалён), локация не теряется и возвращается на корень;
 * - сундук/торговец показывается на корне, если он не привязан ни к одной локации
 *   (защита от «потерянных» карточек) ИЛИ если Мастер явно вынес его на экран (inRoot === true).
 */
export const isContainerVisibleOnRoot = (container, allContainers = []) => {
  if (!container) return false;
  if (container.kind === CONTAINER_KIND.HUB) {
    const parentId = String(container.parentLocationId || '').trim();
    if (!parentId) return true;
    const parentExists = (Array.isArray(allContainers) ? allContainers : []).some(
      (c) => c && c.kind === CONTAINER_KIND.HUB && c.id === parentId,
    );
    return !parentExists;
  }
  const parentHubIds = getHubIdsContainingChild(container.id, allContainers);
  if (parentHubIds.length === 0) return true;
  return container.inRoot === true;
};

/**
 * Анализ последствий удаления локации ('hub'):
 * - exclusiveChildren: сундуки/торговцы, которые числятся ТОЛЬКО в этой локации (и не вынесены на корень);
 * - sharedChildren: сундуки/торговцы из этой локации, которые также есть в других локациях или на корне.
 */
export const analyzeHubDeletion = (hubId, allContainers = []) => {
  const targetHubId = String(hubId || '').trim();
  const list = Array.isArray(allContainers) ? allContainers : [];
  const hub = list.find((c) => c && c.id === targetHubId && c.kind === CONTAINER_KIND.HUB);
  if (!hub) {
    return { exclusiveChildren: [], sharedChildren: [], allExclusive: false };
  }

  const otherHubs = list.filter(
    (c) => c && c.kind === CONTAINER_KIND.HUB && c.id !== targetHubId,
  );
  const byId = new Map(
    list
      .filter((c) => c && [CONTAINER_KIND.LOOT, CONTAINER_KIND.MERCHANT, CONTAINER_KIND.TERMINAL, CONTAINER_KIND.LOCK].includes(c.kind))
      .map((c) => [c.id, c]),
  );

  const exclusiveChildren = [];
  const sharedChildren = [];
  for (const link of normalizeHubLinks(hub.links)) {
    const child = byId.get(link.containerId);
    if (!child) continue;
    const inOtherHub = otherHubs.some((other) => (
      (other.links || []).some((l) => l?.containerId === child.id)
    ));
    if (inOtherHub || child.inRoot === true) {
      sharedChildren.push(child);
    } else {
      exclusiveChildren.push(child);
    }
  }

  return {
    exclusiveChildren,
    sharedChildren,
    allExclusive: exclusiveChildren.length > 0 && sharedChildren.length === 0,
  };
};

/**
 * Собирает живые узлы выдачи для локации ('hub') из списка карточек Мастера.
 * Строго один уровень вложенности: внутрь попадают loot, merchant и terminal.
 */
/** Один узел сессии: одинаковая форма для старого и графового построителя. */
const makeSessionNode = (child, link = {}) => ({
      containerId: child.id,
      kind: child.kind,
      name: child.name,
      description: child.description || '',
      locked: Boolean(link.locked),
      lockLabel: link.lockLabel || '',
      caps: child.kind === CONTAINER_KIND.MERCHANT ? normalizeCapsAmount(child.caps, 0) : 0,
      saleMarkupPercent: child.kind === CONTAINER_KIND.MERCHANT
        ? normalizeSaleMarkupPercent(child.saleMarkupPercent, 0)
        : 0,
      buyDepreciationPercent: child.kind === CONTAINER_KIND.MERCHANT
        ? normalizeBuyDepreciationPercent(child.buyDepreciationPercent, DEFAULT_BUY_DEPRECIATION_PERCENT)
        : DEFAULT_BUY_DEPRECIATION_PERCENT,
      difficulty: child.kind === CONTAINER_KIND.TERMINAL || child.kind === CONTAINER_KIND.LOCK
        ? child.difficulty
        : 0,
      // Патч 516: требование ключа у вложенной точки доступа.
      requiredKeyItemId: String(child.requiredKeyItemId || '').trim(),
      keyRequirement: String(child.keyRequirement || 'none'),
      linkedCheckId: String(child.linkedCheckId || '').trim(),
      // Патч 520: до двух источников через «ИЛИ».
      linkedCheckIds: normalizeLinkedCheckIds(child),
      // Патч 542: явное И/ИЛИ-выражение и особый выход доходят до сессии.
      accessExpression: resolveAccessExpression(child),
      exitLocationId: String(child.exitLocationId || '').trim(),
      // Патч 543: перекрытый проход — игрок у «двери» с причиной.
      passageBlocked: Boolean(child.passageBlocked),
      passageReason: String(child.passageReason || '').trim(),
      characterOverrides: {},
  items: child.kind === CONTAINER_KIND.TERMINAL || child.kind === CONTAINER_KIND.LOCK
    ? []
    : (Array.isArray(child.items)
    ? child.items.map((entry) => ({
        ...entry,
        itemSnapshot: entry.itemSnapshot ? { ...entry.itemSnapshot } : null,
      }))
    : []),
});

const stampSessionNode = (node) => {
  let stamped = node;
  if (node.kind === CONTAINER_KIND.TERMINAL) stamped = withTerminalNodeMarker(node);
  else if (node.kind === CONTAINER_KIND.LOCK) stamped = withLockNodeMarker(node);
  // Патч 544: поверх маркера проверки кладём пространственную обёртку, чтобы
  // старый сервер комнат не превратил локацию в сундук и не потерял рёбра графа.
  return withLocationNodeMarker(stamped);
};

/** Прежний построитель: ровно один уровень, только точки выдачи. Сохранён для совместимости. */
export const buildHubSessionNodes = (hub, allContainers = []) => {
  if (!hub || hub.kind !== CONTAINER_KIND.HUB) return [];
  const byId = new Map(
    (Array.isArray(allContainers) ? allContainers : [])
      .filter((c) => c && [CONTAINER_KIND.LOOT, CONTAINER_KIND.MERCHANT, CONTAINER_KIND.TERMINAL, CONTAINER_KIND.LOCK].includes(c.kind))
      .map((c) => [c.id, c]),
  );
  const links = normalizeHubLinks(hub.links);
  const nodes = [];
  for (const link of links) {
    const child = byId.get(link.containerId);
    if (!child) continue;
    nodes.push(stampSessionNode(makeSessionNode(child, link)));
  }
  return nodes;
};

/**
 * Патч 523: графовый построитель сессии. Обходит ВСЮ вложенность
 * (локация в локации, контейнер в контейнере), переносит несколько родителей
 * через `parentIds`, не зацикливается и считает эффективные коды комнат как
 * объединение кодов узла и всех его родителей.
 */
export const buildLocationSessionNodes = (root, allContainers = []) => {
  if (!root || !root.id) return [];
  const list = Array.isArray(allContainers) ? allContainers : [];
  const byId = new Map(list.filter((c) => c && c.id).map((c) => [String(c.id), c]));
  const graph = locationGraph.buildLocationGraph(list);
  const flat = locationGraph.flattenForSession(graph, String(root.id));

  // Замок на ребре родителя — граница видимости для ребёнка.
  const linkByChild = new Map();
  for (const container of list) {
    for (const link of normalizeHubLinks(container.links)) {
      const prev = linkByChild.get(link.containerId);
      if (!prev || (link.locked && !prev.locked)) linkByChild.set(link.containerId, link);
    }
  }

  const nodes = flat
    .map((entry) => {
      const child = byId.get(entry.id);
      if (!child) return null;
      const link = linkByChild.get(entry.id) || {};
      const node = {
        ...makeSessionNode(child, link),
        parentIds: entry.parentIds,
        childIds: entry.childIds,
        depth: entry.depth,
        roomCodes: entry.roomCodes,
        locked: Boolean(link.locked || entry.locked),
        // Патч 542: цель особого выхода есть в сессии, но не торчит дочерней
        // карточкой в списке родителя — вход в неё идёт кнопкой «Выход».
        exitOnly: Boolean(entry.exitOnly),
        exitLocationId: entry.exitLocationId || String(child.exitLocationId || '').trim(),
      };
      return stampSessionNode(node);
    })
    .filter(Boolean);

  // Преграда может ссылаться на замок/терминал, который не лежит структурно
  // внутри выдаваемой локации. Чтобы мини-игра зарегистрировалась на комнате,
  // добавляем такой источник скрытым служебным узлом (игрок его не видит).
  const present = new Set(nodes.map((node) => node.containerId));
  const checkIds = new Set([
    ...expressionCheckIds(resolveAccessExpression(root)),
    ...nodes.flatMap((node) => expressionCheckIds(resolveAccessExpression(node))),
  ]);
  for (const checkId of checkIds) {
    if (present.has(checkId)) continue;
    const source = byId.get(checkId);
    if (!source || (source.kind !== CONTAINER_KIND.TERMINAL && source.kind !== CONTAINER_KIND.LOCK)) continue;
    nodes.push(stampSessionNode({
      ...makeSessionNode(source),
      parentIds: [String(root.id)],
      childIds: [],
      depth: 1,
      roomCodes: effectiveLocationRoomCodes(source, list),
      locked: false,
      hiddenForPlayers: true,
      exitOnly: false,
      exitLocationId: '',
    }));
    present.add(checkId);
  }
  return nodes;
};

/** Эффективные коды комнат корня: состояние и ресурсы общи для всех привязанных комнат. */
export const effectiveLocationRoomCodes = (root, allContainers = []) => {
  const graph = locationGraph.buildLocationGraph(Array.isArray(allContainers) ? allContainers : []);
  return locationGraph.effectiveRoomCodes(graph, String(root?.id || ''));
};

const deduplicateContainerItems = (rawItems, now = Date.now()) => {
  if (!Array.isArray(rawItems)) return [];
  const seenEntryIds = new Set();
  const out = [];
  rawItems.forEach((item, idx) => {
    const normalized = normalizeContainerItem(item, now + idx);
    if (!normalized) return;
    let entryId = normalized.entryId;
    if (!entryId || seenEntryIds.has(entryId)) {
      entryId = makeEntryId(now + idx);
    }
    seenEntryIds.add(entryId);
    out.push(entryId === normalized.entryId ? normalized : { ...normalized, entryId });
  });
  return out;
};

/**
 * Нормализация контейнера добычи, торговца или локации ('hub').
 */
export const normalizeContainerEntity = (raw = {}, now = Date.now()) => {
  let kind = CONTAINER_KIND.LOOT;
  if (raw.kind === CONTAINER_KIND.MERCHANT) kind = CONTAINER_KIND.MERCHANT;
  else if (raw.kind === CONTAINER_KIND.HUB) kind = CONTAINER_KIND.HUB;
  else if (raw.kind === CONTAINER_KIND.TERMINAL) kind = CONTAINER_KIND.TERMINAL;
  else if (raw.kind === CONTAINER_KIND.LOCK) kind = CONTAINER_KIND.LOCK;

  const items = kind === CONTAINER_KIND.HUB
    || kind === CONTAINER_KIND.TERMINAL
    || kind === CONTAINER_KIND.LOCK
    ? []
    : deduplicateContainerItems(raw.items, now);
  // Патч 523: вложенность разрешена у ЛЮБОГО узла — локация в локации,
  // контейнер в контейнере. Ссылку на самого себя не держим (цикл из одного
  // узла не имеет смысла), а циклы из нескольких узлов — разрешены.
  const links = normalizeHubLinks(raw.links)
    .filter((lnk) => lnk.containerId !== String(raw.id || ''));
  const roomCodes = normalizeRoomCodes(raw.roomCodes, raw.roomCode);
  const primaryRoomCode = roomCodes[0] || '';
  const inRoot = kind === CONTAINER_KIND.HUB
    ? true
    : (raw.inRoot === undefined ? undefined : Boolean(raw.inRoot));

  return {
    id: String(raw.id || makeContainerId(now)),
    kind,
    name: String(raw.name || '').trim(),
    roomCode: primaryRoomCode,
    roomCodes,
    roomName: String(raw.roomName || '').trim(),
    inRoot,
    description: String(raw.description || '').trim(),
    difficulty: kind === CONTAINER_KIND.TERMINAL || kind === CONTAINER_KIND.LOCK
      ? clampNumber(raw.difficulty, 0, 5, 0)
      : 0,
    caps: kind === CONTAINER_KIND.MERCHANT
      ? normalizeCapsAmount(raw.caps, DEFAULT_MERCHANT_CAPS)
      : 0,
    saleMarkupPercent: kind === CONTAINER_KIND.MERCHANT
      ? normalizeSaleMarkupPercent(raw.saleMarkupPercent, DEFAULT_SALE_MARKUP_PERCENT)
      : 0,
    buyDepreciationPercent: kind === CONTAINER_KIND.MERCHANT
      ? normalizeBuyDepreciationPercent(raw.buyDepreciationPercent, DEFAULT_BUY_DEPRECIATION_PERCENT)
      : DEFAULT_BUY_DEPRECIATION_PERCENT,
    items,
    links,
    // Патч 514: вложенные ключевые записи и две строки требования доступа.
    // Терминал ключи не содержит ни при создании, ни перетаскиванием.
    keyItemIds: containerCanHoldKey(kind) ? normalizeKeyItemIds(raw.keyItemIds) : [],
    requiredKeyItemId: String(raw.requiredKeyItemId || '').trim(),
    keyRequirement: containerCanRequireKey(kind)
      ? normalizeKeyRequirement(raw.keyRequirement || (raw.keyRequired ? KEY_REQUIREMENT.REQUIRED : KEY_REQUIREMENT.NONE))
      : KEY_REQUIREMENT.NONE,
    // Патч 538: требование доступа — выражение И/ИЛИ (+ = И, / = ИЛИ).
    // Источник истины — accessExpression; linkedCheckIds остаётся списком
    // операндов для старых читателей, linkedCheckId — первый операнд.
    accessExpression: containerCanRequireKey(kind) ? resolveAccessExpression(raw) : [],
    linkedCheckIds: containerCanRequireKey(kind)
      ? expressionCheckIds(resolveAccessExpression(raw))
      : [],
    // Legacy-поле: первый источник. Старые карточки и сервер 516–519 читают его.
    linkedCheckId: containerCanRequireKey(kind)
      ? (expressionCheckIds(resolveAccessExpression(raw))[0] || '')
      : '',
    // Патч 538: строки локации — родительская локация (вложенность/ветвление)
    // и выход из локации (особый переход/телепорт, если ведёт не к родителю).
    // Флаг «Хаб» помечает локацию-каталог для просмотра структуры деревом.
    parentLocationId: kind === CONTAINER_KIND.HUB
      ? String(raw.parentLocationId || '').trim()
      : '',
    exitLocationId: kind === CONTAINER_KIND.HUB
      ? String(raw.exitLocationId || '').trim()
      : '',
    // Патч 543: перекрытый проход локации (глухая преграда) — только у
    // локаций; причина свободный текст, пусто = «Проход заблокирован».
    passageBlocked: kind === CONTAINER_KIND.HUB ? Boolean(raw.passageBlocked) : false,
    passageReason: kind === CONTAINER_KIND.HUB ? String(raw.passageReason || '').trim() : '',
    isCatalogHub: kind === CONTAINER_KIND.HUB ? Boolean(raw.isCatalogHub) : false,
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
};

// Патч 522: один закон стака для инвентаря, склада и торговцев.
const snapshotMergeSignature = (snapshot) => itemStacking.itemStackKey(snapshot);

/**
 * Добавляет или объединяет одинаковую позицию в списке контейнера/торговца.
 * Позиции склеиваются, если совпадают тип, id, имя, индивидуальная наценка
 * и сигнатура модификаций/состояния экземпляра.
 */
export const addOrMergeContainerItem = (items = [], rawCandidate, now = Date.now()) => {
  const candidate = normalizeContainerItem(rawCandidate, now);
  if (!candidate) return Array.isArray(items) ? [...items] : [];

  const next = Array.isArray(items) ? items.map((entry) => ({ ...entry })) : [];
  const candSig = snapshotMergeSignature(candidate.itemSnapshot);

  const matchIdx = next.findIndex((entry) => (
    entry.itemType === candidate.itemType
    && entry.itemId === candidate.itemId
    && entry.name === candidate.name
    && Number(entry.markupPercent || 0) === Number(candidate.markupPercent || 0)
    && snapshotMergeSignature(entry.itemSnapshot) === candSig
  ));

  if (matchIdx >= 0) {
    next[matchIdx] = {
      ...next[matchIdx],
      quantity: next[matchIdx].quantity + candidate.quantity,
    };
    return next;
  }

  next.push(candidate);
  return next;
};

/**
 * Вычисляет действующие проценты торговца для конкретного персонажа:
 * учитывает персональную живую подкрутку Мастера (characterOverrides),
 * а если её нет — общие проценты торговца.
 */
export const getEffectiveMerchantRates = (sessionOrMerchant, characterId = null) => {
  const baseSale = normalizeSaleMarkupPercent(
    sessionOrMerchant?.saleMarkupPercent,
    DEFAULT_SALE_MARKUP_PERCENT,
  );
  const baseDepr = normalizeBuyDepreciationPercent(
    sessionOrMerchant?.buyDepreciationPercent,
    DEFAULT_BUY_DEPRECIATION_PERCENT,
  );
  if (!characterId || !sessionOrMerchant?.characterOverrides) {
    return {
      saleMarkupPercent: baseSale,
      buyDepreciationPercent: baseDepr,
      isPersonalOverride: false,
    };
  }
  const override = sessionOrMerchant.characterOverrides[characterId];
  if (!override || typeof override !== 'object') {
    return {
      saleMarkupPercent: baseSale,
      buyDepreciationPercent: baseDepr,
      isPersonalOverride: false,
    };
  }
  return {
    saleMarkupPercent: override.saleMarkupPercent !== undefined
      ? normalizeSaleMarkupPercent(override.saleMarkupPercent, baseSale)
      : baseSale,
    buyDepreciationPercent: override.buyDepreciationPercent !== undefined
      ? normalizeBuyDepreciationPercent(override.buyDepreciationPercent, baseDepr)
      : baseDepr,
    isPersonalOverride: true,
  };
};

/**
 * Цена ПОКУПКИ 1 шт. товара игроком У ТОРГОВЦА:
 * baseCost * (1 + (наценкаТовара + наценкаТорговца) / 100) * (1 - скидкаПерка / 100).
 * Для платных предметов (baseCost > 0) при положительном множителе цена не падает ниже 1 кр.
 */
export const computeMerchantSellPriceToPlayer = (
  entry,
  { saleMarkupPercent = 0, capCollectorPercent = 0 } = {},
) => {
  const baseCost = itemStacking.effectiveItemCost(entry);
  if (baseCost <= 0) return 0;

  const itemMarkup = Number(entry?.markupPercent) || 0;
  const merchantMarkup = Number(saleMarkupPercent) || 0;
  const combinedMarkup = itemMarkup + merchantMarkup;
  const markupFactor = 1 + combinedMarkup / 100;
  if (markupFactor <= 0) return 0;

  const perkDiscount = clampNumber(capCollectorPercent, 0, 100, 0);
  const rawPrice = baseCost * markupFactor * (1 - perkDiscount / 100);
  if (rawPrice <= 0) return 0;
  return Math.max(1, Math.round(rawPrice));
};

/**
 * Цена СКУПКИ 1 шт. предмета игрока ТОРГОВЦЕМ:
 * baseCost * (1 - обесцениваниеЗакупки / 100) * (1 + бонусПерка / 100).
 * Знак «минус» у обесценивания уже заложен в формулу (50 => 50% от базовой цены).
 */
export const computeMerchantBuybackPriceFromPlayer = (
  item,
  { buyDepreciationPercent = DEFAULT_BUY_DEPRECIATION_PERCENT, capCollectorPercent = 0, catalogCost = null } = {},
) => {
  const resolvedBase = catalogCost != null
    ? Number(catalogCost)
    : itemStacking.effectiveItemCost(item);
  const baseCost = Math.max(0, Number.isFinite(resolvedBase) ? resolvedBase : 0);
  if (baseCost <= 0) return 0;

  const depreciation = normalizeBuyDepreciationPercent(buyDepreciationPercent);
  if (depreciation >= 100) return 0;

  const perkBonus = clampNumber(capCollectorPercent, 0, 100, 0);
  const rawPrice = baseCost * (1 - depreciation / 100) * (1 + perkBonus / 100);
  return Math.max(0, Math.round(rawPrice));
};

/**
 * Расчёт двухпанельного буфера бартера между игроком и торговцем.
 * - buyBuffer: { [entryId]: quantity } — выбрано у торговца (лежит у игрока серым курсивом);
 * - sellBuffer: { [playerItemId]: quantity } — отдаётся торговцу (лежит у торговца серым курсивом).
 */
export const computeBarterSummary = ({
  merchantItems = [],
  playerItems = [],
  buyBuffer = {},
  sellBuffer = {},
  saleMarkupPercent = 0,
  buyDepreciationPercent = DEFAULT_BUY_DEPRECIATION_PERCENT,
  capCollectorPercent = 0,
  playerCaps = 0,
  merchantCaps = 0,
  resolvePlayerItemCatalogCost = null,
} = {}) => {
  const buyLines = [];
  let totalBuyCost = 0;

  for (const entry of merchantItems) {
    const requested = Math.floor(Number(buyBuffer?.[entry.entryId]) || 0);
    if (requested <= 0) continue;
    const quantity = Math.min(requested, Math.max(0, Math.floor(Number(entry.quantity) || 0)));
    if (quantity <= 0) continue;
    const unitPrice = computeMerchantSellPriceToPlayer(entry, {
      saleMarkupPercent,
      capCollectorPercent,
    });
    const lineTotal = unitPrice * quantity;
    totalBuyCost += lineTotal;
    buyLines.push({
      entryId: entry.entryId,
      name: entry.name,
      itemType: entry.itemType,
      quantity,
      unitPrice,
      lineTotal,
      entry,
    });
  }

  const sellLines = [];
  let totalSellValue = 0;

  for (const pItem of playerItems) {
    const key = String(pItem.id);
    const requested = Math.floor(Number(sellBuffer?.[key]) || 0);
    if (requested <= 0) continue;
    const available = Math.max(0, Math.floor(Number(pItem.quantity) || 0));
    const quantity = Math.min(requested, available);
    if (quantity <= 0) continue;
    const catalogCost = typeof resolvePlayerItemCatalogCost === 'function'
      ? resolvePlayerItemCatalogCost(pItem)
      : null;
    const unitPrice = computeMerchantBuybackPriceFromPlayer(pItem, {
      buyDepreciationPercent,
      capCollectorPercent,
      catalogCost,
    });
    const lineTotal = unitPrice * quantity;
    totalSellValue += lineTotal;
    sellLines.push({
      playerItemId: key,
      name: pItem.name,
      itemType: pItem.itemType,
      quantity,
      unitPrice,
      lineTotal,
      item: pItem,
    });
  }

  const safePlayerCaps = normalizeCapsAmount(playerCaps, 0);
  const safeMerchantCaps = normalizeCapsAmount(merchantCaps, 0);
  const netDelta = totalSellValue - totalBuyCost;
  const playerOwes = netDelta < 0 ? Math.abs(netDelta) : 0;
  const merchantOwes = netDelta > 0 ? netDelta : 0;
  const canPlayerAfford = playerOwes <= safePlayerCaps;
  const merchantCapShortfall = merchantOwes > safeMerchantCaps
    ? merchantOwes - safeMerchantCaps
    : 0;
  const actualMerchantPayout = Math.min(merchantOwes, safeMerchantCaps);

  return {
    buyLines,
    sellLines,
    hasItems: buyLines.length > 0 || sellLines.length > 0,
    totalBuyCost,
    totalSellValue,
    netDelta,
    playerOwes,
    merchantOwes,
    canPlayerAfford,
    merchantCapShortfall,
    actualMerchantPayout,
    projectedPlayerCaps: safePlayerCaps - playerOwes + actualMerchantPayout,
    projectedMerchantCaps: safeMerchantCaps + playerOwes - actualMerchantPayout,
  };
};

/**
 * Уникальное имя дубликата карточки («Сейф смотрителя (копия)», «... (копия 2)»).
 */
export const buildDuplicateContainerName = (baseName, existingNames = [], copySuffix = 'копия') => {
  const cleanBase = String(baseName || '').trim() || 'Контейнер';
  const taken = new Set((existingNames || []).map((n) => String(n || '').trim().toLowerCase()));
  const firstCandidate = `${cleanBase} (${copySuffix})`;
  if (!taken.has(firstCandidate.toLowerCase())) return firstCandidate;
  let counter = 2;
  while (taken.has(`${cleanBase} (${copySuffix} ${counter})`.toLowerCase())) {
    counter += 1;
  }
  return `${cleanBase} (${copySuffix} ${counter})`;
};

/**
 * Полное клонирование контейнера или торговца со всеми предметами, лимитом крышек и процентами.
 */
export const duplicateContainerEntity = (
  source,
  { existingNames = [], copySuffix = 'копия', now = Date.now() } = {},
) => {
  const normalized = normalizeContainerEntity(source, now);
  return {
    ...normalized,
    id: makeContainerId(now),
    name: buildDuplicateContainerName(normalized.name, existingNames, copySuffix),
    items: normalized.items.map((entry, index) => ({
      ...entry,
      entryId: makeEntryId(now + index + 1),
      itemSnapshot: entry.itemSnapshot ? { ...entry.itemSnapshot } : null,
    })),
    links: (normalized.links || []).map((lnk) => ({ ...lnk })),
    roomCodes: [...(normalized.roomCodes || [])],
    createdAt: now,
    updatedAt: now,
  };
};

const HUB_WORD_SPLIT_RE = /[\s\-–—_/.,()"«»[\]]+/;

/**
 * Подбор и ранжирование локаций ('hub') для строки выбора + автодополнения
 * в форме создания/редактирования сундука или торговца.
 *
 * Приоритет совпадений:
 *  0 — точное совпадение названия (без учёта регистра);
 *  1 — префикс с начала строки (напр. "New" -> "New Vegas");
 *  2 — префикс с начала любого слова (напр. "Vegas" -> "New Vegas");
 *  3 — подстрока внутри названия.
 * Внутри одного ранга ещё не выбранные локации идут выше уже выбранных,
 * чтобы автоподсказка всегда предлагала следующее полезное действие.
 */
export const matchHubSuggestions = (
  query = '',
  availableHubs = [],
  selectedHubIds = [],
) => {
  const hubs = (Array.isArray(availableHubs) ? availableHubs : []).filter(
    (h) => h && h.id && String(h.name || '').trim().length > 0,
  );
  const selectedSet = new Set(Array.isArray(selectedHubIds) ? selectedHubIds : []);
  const cleanQuery = String(query ?? '').replace(/^\s+/, '');
  const trimmedQuery = cleanQuery.trim();

  if (!trimmedQuery) {
    return {
      matches: hubs,
      bestMatch: null,
      ghostSuffix: '',
      exactHub: null,
    };
  }

  const lowerQuery = trimmedQuery.toLowerCase();
  const lowerCleanQuery = cleanQuery.toLowerCase();

  let exactHub = null;
  const scored = [];

  hubs.forEach((hub, index) => {
    const rawName = String(hub.name || '').trim();
    const lowerName = rawName.toLowerCase();

    if (lowerName === lowerQuery && !exactHub) {
      exactHub = hub;
    }

    let rank = -1;
    if (lowerName === lowerQuery) {
      rank = 0;
    } else if (lowerName.startsWith(lowerCleanQuery) || lowerName.startsWith(lowerQuery)) {
      rank = 1;
    } else {
      const words = lowerName.split(HUB_WORD_SPLIT_RE).filter(Boolean);
      if (words.some((w) => w.startsWith(lowerQuery))) {
        rank = 2;
      } else if (lowerName.includes(lowerQuery)) {
        rank = 3;
      }
    }

    if (rank >= 0) {
      scored.push({
        hub,
        rank,
        alreadySelected: selectedSet.has(hub.id) ? 1 : 0,
        index,
      });
    }
  });

  scored.sort((a, b) => {
    if (a.alreadySelected !== b.alreadySelected) {
      return a.alreadySelected - b.alreadySelected;
    }
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return a.index - b.index;
  });

  const matches = scored.map((entry) => entry.hub);
  const bestEntry = scored.find((entry) => entry.alreadySelected === 0) || null;
  const bestMatch = bestEntry ? bestEntry.hub : null;

  let ghostSuffix = '';
  if (bestMatch) {
    const bestName = String(bestMatch.name || '').trim();
    if (bestName.toLowerCase().startsWith(lowerCleanQuery) && bestName.length > cleanQuery.length) {
      ghostSuffix = bestName.slice(cleanQuery.length);
    }
  }

  return {
    matches,
    bestMatch,
    ghostSuffix,
    exactHub,
  };
};


/** Патч 520: отдельно выданный замок (без локации). */
export const buildStandaloneLockSessionNode = (container, { locked = false, lockLabel = '' } = {}) => withLockNodeMarker({
  containerId: container?.id,
  kind: CONTAINER_KIND.LOCK,
  name: container?.name || '',
  description: container?.description || '',
  locked,
  lockLabel,
  difficulty: container?.difficulty || 0,
  requiredKeyItemId: String(container?.requiredKeyItemId || '').trim(),
  keyRequirement: String(container?.keyRequirement || 'none'),
  linkedCheckId: String(container?.linkedCheckId || '').trim(),
  linkedCheckIds: normalizeLinkedCheckIds(container),
  items: [],
});
