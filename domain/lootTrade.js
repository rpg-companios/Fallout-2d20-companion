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
 * Нормализация контейнера добычи или торговца.
 */
export const normalizeContainerEntity = (raw = {}, now = Date.now()) => {
  const kind = raw.kind === CONTAINER_KIND.MERCHANT
    ? CONTAINER_KIND.MERCHANT
    : CONTAINER_KIND.LOOT;
  const items = Array.isArray(raw.items)
    ? raw.items.map((item, idx) => normalizeContainerItem(item, now + idx)).filter(Boolean)
    : [];

  return {
    id: String(raw.id || makeContainerId(now)),
    kind,
    name: String(raw.name || '').trim(),
    roomCode: String(raw.roomCode || '').trim(),
    roomName: String(raw.roomName || '').trim(),
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
    createdAt: now,
    updatedAt: now,
  };
};
