// domain/lootTrade.js
// Доменная модель и чистая математика раздела Мастера «Добыча/Торговля»:
// - два типа карточек: 'loot' (контейнер добычи) и 'merchant' (торговец);
// - немедленный бросок количества (шт. / CD / d20) при сохранении позиции;
// - формула специализации торговца: (наценка товара + наценка торговца) + автоучёт перков;
// - формула обесценивания скупки (по умолчанию 50%, без ввода знака минус) + автоучёт перков;
// - расчёт двухпанельного буфера обмена с контролем лимита крышек торговца;
// - дублирование контейнеров и слияние одинаковых позиций.

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
    cost: Math.max(0, Number(raw.cost ?? raw.price ?? 0) || 0),
    weight: Math.max(0, Number(String(raw.weight ?? 0).replace(',', '.')) || 0),
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
  [CONTAINER_KIND.MERCHANT]: 2,
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
 * - все локации ('hub') всегда на корневом экране;
 * - сундук/торговец показывается на корне, если он не привязан ни к одной локации
 *   (защита от «потерянных» карточек) ИЛИ если Мастер явно вынес его на экран (inRoot === true).
 */
export const isContainerVisibleOnRoot = (container, allContainers = []) => {
  if (!container) return false;
  if (container.kind === CONTAINER_KIND.HUB) return true;
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
      .filter((c) => c && (c.kind === CONTAINER_KIND.LOOT || c.kind === CONTAINER_KIND.MERCHANT))
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
 * Строго один уровень вложенности: внутрь попадают только 'loot' и 'merchant'.
 */
export const buildHubSessionNodes = (hub, allContainers = []) => {
  if (!hub || hub.kind !== CONTAINER_KIND.HUB) return [];
  const byId = new Map(
    (Array.isArray(allContainers) ? allContainers : [])
      .filter((c) => c && (c.kind === CONTAINER_KIND.LOOT || c.kind === CONTAINER_KIND.MERCHANT))
      .map((c) => [c.id, c]),
  );
  const links = normalizeHubLinks(hub.links);
  const nodes = [];
  for (const link of links) {
    const child = byId.get(link.containerId);
    if (!child) continue;
    nodes.push({
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
      characterOverrides: {},
      items: Array.isArray(child.items)
        ? child.items.map((entry) => ({
            ...entry,
            itemSnapshot: entry.itemSnapshot ? { ...entry.itemSnapshot } : null,
          }))
        : [],
    });
  }
  return nodes;
};

/**
 * Нормализация контейнера добычи, торговца или локации ('hub').
 */
export const normalizeContainerEntity = (raw = {}, now = Date.now()) => {
  let kind = CONTAINER_KIND.LOOT;
  if (raw.kind === CONTAINER_KIND.MERCHANT) kind = CONTAINER_KIND.MERCHANT;
  else if (raw.kind === CONTAINER_KIND.HUB) kind = CONTAINER_KIND.HUB;

  const items = kind === CONTAINER_KIND.HUB
    ? []
    : (Array.isArray(raw.items)
        ? raw.items.map((item, idx) => normalizeContainerItem(item, now + idx)).filter(Boolean)
        : []);
  const links = kind === CONTAINER_KIND.HUB
    ? normalizeHubLinks(raw.links).filter((lnk) => lnk.containerId !== String(raw.id || ''))
    : [];
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
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
};

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
  const baseCost = Math.max(0, Number(entry?.cost ?? entry?.price ?? 0) || 0);
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
    : Number(item?.cost ?? item?.price ?? 0);
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

