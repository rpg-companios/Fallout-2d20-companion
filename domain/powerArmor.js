/**
 * powerArmor.js — константы и доменная логика силовой брони.
 * Специфика: docs/architecture/power-armor-plan.md
 *
 * Всё чистое: функции принимают состояние и возвращают новое, ничего не мутируют.
 * ПРАВИЛО ВЛАДЕЛЬЦА: никакого легаси, нормализаторов и фоллбэков — malformed-данные
 * здесь не «чинятся», а не проходят по белому списку контракта.
 */

import { rollByType } from './diceRollsLogic';
import { getCanonicalAttributeKey } from './characterCreation';

// Расход зарядов Ядерного блока каркасом, зарядов в час. Временное значение (§3.3 плана).
export const PA_CORE_DRAIN_PER_HOUR = 5;

// Бросок зарядов нового Ядерного блока.
// Запись — конвенция diceRollsLogic.rollByType(rollType, rollValue):
// rollType — какой кубик (rollD20 / rollCD), rollValue — сколько бросков. Раздельно, как в проекте.
// Максимум подписи берётся НЕ отсюда, а из данных предмета (maxCharges у ammo_fusion_core).
export const FUSION_CORE_CHARGES_ROLL = { rollType: 'rollD20', rollValue: 1 };

// Миллисекунд аптайма на 1 заряд (при расходе 5/час = 12 минут).
export const PA_MS_PER_CHARGE = 3600000 / PA_CORE_DRAIN_PER_HOUR;

export const FUSION_CORE_ID = 'ammo_fusion_core';

// Слоты частей пакета (§2 плана): как у обычной брони — левая/правая рука и нога
// отдельно. Наруч/понож — ОДИН предмет, подходящий на любую сторону пары.
export const PA_PIECE_SLOTS = Object.freeze(['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']);

// Явная карта «зона данных → слоты-кандидаты пакета». Других зон у частей PA быть не должно.
const PA_AREA_TO_CANDIDATE_SLOTS = Object.freeze({
  Head: ['head'],
  Body: ['body'],
  Hand: ['leftArm', 'rightArm'],
  Leg: ['leftLeg', 'rightLeg'],
});

const PA_FRAME_SET_KEY = 'frame';

// ─── Конструкторы состояния (§4) ────────────────────────────────────────────

/** Пустое состояние надетого пакета. */
export const createEmptyEquippedPowerArmor = () => ({
  frame: null,
  pieces: {
    head: null, body: null,
    leftArm: null, rightArm: null,
    leftLeg: null, rightLeg: null,
  },
});

/** Накопитель расхода (персистентный, §5.3): время работы приложения. */
export const createEmptyPowerArmorRuntime = () => ({ coreAccumulatorMs: 0 });

// ─── Классификация предметов ────────────────────────────────────────────────

/** Каркас — отдельный предмет: явное поле set: 'frame' в данных. */
export const isPowerArmorFrame = (item) =>
  item?.itemType === 'powerArmor' && item?.set === PA_FRAME_SET_KEY;

/**
 * Слоты-кандидаты части PA по её данным. Каркас → [] (это не часть).
 * Наруч → ['leftArm','rightArm'], понож → ['leftLeg','rightLeg'] (один предмет
 * на любую сторону, как у обычной брони). Часть с неизвестной зоной → []
 * (не проходит по белому списку).
 */
export const powerArmorSlotsFor = (item) => {
  if (!item || item.itemType !== 'powerArmor' || isPowerArmorFrame(item)) return [];
  const areas = item.protectedAreas;
  if (!Array.isArray(areas) || areas.length !== 1) return [];
  return PA_AREA_TO_CANDIDATE_SLOTS[areas[0]] ?? [];
};

/**
 * Целевой слот для части (как у обычной брони, §5.2):
 *  - есть свободный кандидат        → { kind: 'slot', slot }  (надеваем в него)
 *  - кандидат один и он занят        → { kind: 'slot', slot }  (замена: старая часть → инвентарь)
 *  - пара и обе стороны заняты       → { kind: 'choice', slots }  (игрок выбирает L/R)
 */
export const resolvePowerArmorPieceTarget = (equipped, candidateSlots) => {
  const slots = candidateSlots || [];
  const free = slots.find((slot) => !equipped?.pieces?.[slot]);
  if (free) return { kind: 'slot', slot: free };
  if (slots.length === 1) return { kind: 'slot', slot: slots[0] };
  return { kind: 'choice', slots };
};

// ─── Стекинг (§4) ───────────────────────────────────────────────────────────

// Подпись модов — конвенция инвентаря (оружие): appliedMods — мапа slotType→modId,
// значения сортируются и склеиваются '|'; без модов — 'none'.
const modsSignature = (appliedMods) => {
  const ids = Object.values(appliedMods || {}).filter(Boolean).sort();
  return ids.length ? ids.join('|') : 'none';
};

/** Ядерный Блок: разные заряды — разные стопки (§2: «Блоки с разным количеством зарядов лежат отдельно»). */
export const fusionCoreStackKey = (charges) => `ammo:${FUSION_CORE_ID}:charges:${charges}`;

/** Часть PA: id + моды + текущая прочность. Битая с модами а+б+в ≠ битая с а+б+г; 5/10 ≠ 10/10. */
export const powerArmorPieceStackKey = (piece) =>
  `powerArmor:${piece.catalogId}:mods:${modsSignature(piece.appliedMods)}:hp:${piece.hpCurrent}`;

/** Пакет в инвентаре: каркас + подпись установленных частей + заряд блока. */
export const powerArmorFrameStackKey = (frameItem) => {
  const piecesSig = PA_PIECE_SLOTS
    .map((slot) => {
      const p = frameItem.installedPieces?.[slot];
      return p ? `${slot}:${powerArmorPieceStackKey(p)}` : `${slot}:empty`;
    })
    .join('|');
  const coreSig = frameItem.installedCore ? String(frameItem.installedCore.charges) : 'none';
  return `powerArmor:${frameItem.id}:mods:${modsSignature(frameItem.appliedMods)}:pieces:${piecesSig}:core:${coreSig}`;
};

// ─── Экипировка: проверки и транзакции пакета ───────────────────────────────

export const hasFrame = (equipped) => Boolean(equipped?.frame);

/**
 * Можно ли надеть часть (§5.2): нужен надетый каркас; часть с прочностью 0 не надевается.
 * reason: 'needsFrame' | 'broken' | null.
 */
export const canEquipPowerArmorPiece = (equipped, piece) => {
  if (!hasFrame(equipped)) return { ok: false, reason: 'needsFrame' };
  if (isPieceBroken(piece)) return { ok: false, reason: 'broken' };
  return { ok: true, reason: null };
};

/** Надеть часть в слот пакета. Возвращает новое состояние. Замену (старая часть → инвентарь) делает вызывающий. */
export const equipPowerArmorPiece = (equipped, slot, piece) => ({
  ...equipped,
  pieces: { ...equipped.pieces, [slot]: piece },
});

/**
 * Снять пакет → инвентарный предмет каркаса (§4): каркас уносит части и блок с собой.
 * Кладётся ТОЛЬКО контрактный набор полей; stackKey считается сразу той же функцией.
 */
export const packPackage = (equipped) => {
  const item = {
    id: equipped.frame.catalogId,
    itemType: 'powerArmor',
    set: PA_FRAME_SET_KEY,
    appliedMods: equipped.frame.appliedMods || {},
    installedPieces: { ...equipped.pieces },
    installedCore: equipped.frame.core || null,
  };
  return { ...item, stackKey: powerArmorFrameStackKey(item) };
};

/**
 * Надеть пакет из инвентарного предмета каркаса → надетое состояние (§5.1: блок уже внутри).
 * Каталожный id — по контракту addNewItem: у стор-записи инвентаря id занят инстанс-ключом
 * (у PA — stackKey), а канонический каталожный id лежит в weaponId; у свежего предмета
 * из каталога weaponId нет — id и есть канонический (та же конвенция, что у isFusionCoreItem).
 */
export const unpackPackage = (frameItem) => ({
  frame: {
    catalogId: frameItem.weaponId || frameItem.id,
    appliedMods: frameItem.appliedMods || {},
    core: frameItem.installedCore || null,
  },
  pieces: { ...createEmptyEquippedPowerArmor().pieces, ...(frameItem.installedPieces || {}) },
});


/** Вставить блок в надетый каркас. Блок изымается из инвентаря вызывающим. */
export const insertCore = (equipped, core) => ({
  ...equipped,
  frame: { ...equipped.frame, core: { charges: core.charges } },
});

// ─── Ядерный Блок ───────────────────────────────────────────────────────────

// id — каталожный id (предмет из каталога), weaponId — канонический id в стор-инвентаре
// (addNewItem кладёт каталожный id в поле weaponId для всех типов предметов).
export const isFusionCoreItem = (item) => item?.id === FUSION_CORE_ID || item?.weaponId === FUSION_CORE_ID;

/** Заряженные блоки среди предметов инвентаря. */
export const findChargedFusionCores = (inventoryItems) =>
  (inventoryItems || []).filter((item) => isFusionCoreItem(item) && (item.charges ?? 0) > 0);

/**
 * Выбор блока (§5.1/§5.4 и пожелание владельца про выбор):
 *  - нет заряженных            → { kind: 'none' }  (каркас не надеть / пакет снимается)
 *  - одинаковый заряд у всех   → { kind: 'auto', core }  (молча первый из стопки)
 *  - разный заряд              → { kind: 'choice', cores }  (игрок выбирает)
 * Порядок cores — порядок инвентаря вызывающего.
 */
export const pickFusionCore = (cores) => {
  const charged = (cores || []).filter((c) => (c?.charges ?? 0) > 0);
  if (charged.length === 0) return { kind: 'none' };
  const same = charged.every((c) => c.charges === charged[0].charges);
  return same ? { kind: 'auto', core: charged[0] } : { kind: 'choice', cores: charged };
};

/** Заряды нового блока (§3.2): бросок из конфига, кламп к maxCharges из данных предмета. */
export const rollNewFusionCoreCharges = (maxCharges) => {
  const rolled = rollByType(FUSION_CORE_CHARGES_ROLL.rollType, FUSION_CORE_CHARGES_ROLL.rollValue);
  return Math.max(1, Math.min(rolled, maxCharges));
};

// ─── Таймер расхода (§5.3/§5.4) ─────────────────────────────────────────────

/**
 * Накопить аптайм и сказать, сколько зарядов сгорело.
 * Приложение закрыто → вызывающий просто не тикает; накопитель персистентный.
 * Возвращает { coreAccumulatorMs, chargesConsumed }.
 */
export const tickCoreAccumulator = (runtime, elapsedMs) => {
  const total = (runtime?.coreAccumulatorMs || 0) + Math.max(0, elapsedMs || 0);
  const chargesConsumed = Math.floor(total / PA_MS_PER_CHARGE);
  return {
    coreAccumulatorMs: total - chargesConsumed * PA_MS_PER_CHARGE,
    chargesConsumed,
  };
};

/**
 * Списать заряды с активного блока. Дошло до нуля → блок израсходован и исчезает
 * (core становится null), depleted: true. Дальше (замена/снятие пакета) решает §5.4.
 */
export const drainActiveCore = (equipped, chargesConsumed) => {
  if (!chargesConsumed || !equipped.frame?.core) return { equipped, depleted: false };
  const left = equipped.frame.core.charges - chargesConsumed;
  if (left > 0) {
    return { equipped: { ...equipped, frame: { ...equipped.frame, core: { charges: left } } }, depleted: false };
  }
  return { equipped: { ...equipped, frame: { ...equipped.frame, core: null } }, depleted: true };
};

// ─── Прочность и починка (§5.7) ─────────────────────────────────────────────

export const isPieceBroken = (piece) => (piece?.hpCurrent ?? 0) <= 0;

export const needsRepair = (piece, maxHp) => (piece?.hpCurrent ?? 0) < maxHp;

/**
 * ПРАВИЛО ВЛАДЕЛЬЦА: сейчас починка бесплатно до максимума.
 * Окно «за деньги / за материалы» — отдельная будущая задача (план §9), кода под неё нет.
 */
export const repairPowerArmorPiece = (piece, maxHp) => ({ ...piece, hpCurrent: maxHp });

/** Кнопки −/+ на экране: шаг в пределах 0..maxHp, без выхода за границы. */
export const adjustPieceHp = (piece, delta, maxHp) => ({
  ...piece,
  hpCurrent: Math.max(0, Math.min(maxHp, (piece?.hpCurrent ?? 0) + delta)),
});

// ─── Подавление нижних слоёв (§5.5) ─────────────────────────────────────────

/**
 * ПРАВИЛО ВЛАДЕЛЬЦА: подавление ЯЧЕЙКОВОЕ — надетая часть подавляет нижние слои
 * только своего слота; голый каркас не подавляет ничего. Сетка на экране видна
 * всегда, ячейка со частью СБ показывает только её параметры.
 */
export const suppressesLayerAt = (equipped, slot) => Boolean(equipped?.pieces?.[slot]);

// ─── Модификаторы каркаса (§3.4/§5.6) ───────────────────────────────────────

/** attributeModifier каркаса из его каталожных данных (null, если не объявлен). */
export const getFrameAttributeModifiers = (catalogFrameItem) =>
  catalogFrameItem?.modifiers?.attributeModifier || null;

/**
 * Применить одну запись значения-модификатора. Семейство операций — белый список
 * проекта { '+', '-', 'set' } (семантика как у модов оружия в modsEquip: set = строго).
 * Неизвестная операция — ошибка данных, а НЕ «тихий minus».
 */
export const applyAttributeModifierValue = (base, entry) => {
  const value = Number(entry?.value);
  if (!Number.isFinite(value)) throw new Error(`[powerArmor] attributeModifier value не число: ${entry?.value}`);
  if (entry?.op === 'set') return value;
  if (entry?.op === '+') return base + value;
  if (entry?.op === '-') return base - value;
  throw new Error(`[powerArmor] неизвестная операция атрибут-модификатора: ${entry?.op}`);
};

/**
 * Эффективные атрибуты с применёнными модификаторами каркаса (§5.6):
 * получает массив [{name, value}] и КАТАЛОЖНЫЙ предмет каркаса (с modifiers).
 * Каркаса нет / атрибутов нет → возвращает массив как есть (та же ссылка).
 * Ключи атрибутов канонизируются (STR/СИЛ) — совпадает только объявленное в данных.
 */
export const applyFrameAttributeModifiers = (attributesArray, catalogFrameItem) => {
  const mods = getFrameAttributeModifiers(catalogFrameItem);
  if (!mods || !Array.isArray(attributesArray)) return attributesArray;
  return attributesArray.map((attr) => {
    const key = getCanonicalAttributeKey(attr?.name ?? attr?.id);
    const entry = key ? mods[key] : null;
    if (!entry) return attr;
    return { ...attr, value: applyAttributeModifierValue(Number(attr.value) || 0, entry) };
  });
};
