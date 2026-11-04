'use strict';

/**
 * Патч 522: единая механика предметов для инвентаря, склада и торговцев.
 *
 * Один модуль на всех: клиент (React Native / Metro / Vite) и комнатный сервер
 * (CommonJS) загружают ОДНИ И ТЕ ЖЕ правила. Раньше инвентарь считал стек-ключ
 * локальной функцией, сервер сессий дублировал `snapshotMergeSignature`, а склад
 * изобретал свой снимок — из-за этого моды, заряды и прочность терялись или
 * склеивались неверно при смене места хранения.
 *
 * Модуль сознательно написан на CommonJS и не зависит от React, сети, стора и
 * каталога: сервер не умеет загружать ESM-файлы domain/, а Metro и Vite умеют
 * импортировать CJS. Чистые функции, никаких побочных эффектов.
 */

const FUSION_CORE_ID = 'ammo_fusion_core';
const PA_FRAME_SET_KEY = 'frame';
const PA_PIECE_SLOTS = Object.freeze(['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']);

// ─── Защита сервера -----------------------------------------------------------
// Снимок предмета приходит по сети. Не даём клиенту отравить прототип, положить
// циклическую структуру или завалить сервер гигантским сообщением. Это НЕ игровое
// ограничение количества/веса — только санитайзинг входящих данных.
const FORBIDDEN_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);
const MAX_SNAPSHOT_DEPTH = 12;
const MAX_SNAPSHOT_BYTES = 64 * 1024;

const sanitizeValue = (value, depth = 0) => {
  if (depth > MAX_SNAPSHOT_DEPTH) return null;
  if (value === null || typeof value !== 'object') {
    // функции/символы/undefined не едут по сети
    return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
      ? value
      : null;
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, depth + 1));
  const out = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) continue;
    out[key] = sanitizeValue(value[key], depth + 1);
  }
  return out;
};

/** Безопасный снимок: без прототипных ключей, циклов и超限. */
const sanitizeItemSnapshot = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let plain;
  try {
    plain = JSON.parse(JSON.stringify(raw));
  } catch {
    return null; // циклическая структура / BigInt и прочее
  }
  const clean = sanitizeValue(plain);
  try {
    if (JSON.stringify(clean).length > MAX_SNAPSHOT_BYTES) return null;
  } catch {
    return null;
  }
  return clean;
};

/** Валидация количества: не игровой лимит, а защита от некорректного клиента. */
const isValidQuantity = (value) => Number.isSafeInteger(value) && value > 0;

// ─── Идентичность и стек (канон из domain/itemIdentity.js + domain/powerArmor.js) ──

const slugifyBaseName = (baseName = '') => String(baseName)
  .toLowerCase()
  .replace(/[^a-zа-яё0-9]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

const buildKey = (weaponId, appliedMods = {}, baseName = '', durability, uniqQualities = []) => {
  if (!weaponId) return 'anonymous';
  const modIds = Object.entries(appliedMods || {})
    .sort(([k1], [k2]) => String(k1).localeCompare(String(k2)))
    .map(([, modId]) => modId)
    .join('_');
  const parts = [weaponId];
  if (durability !== undefined && durability !== null && durability !== '') {
    parts.push(`dur_${durability}`);
  }
  if (modIds) parts.push(`mods_${modIds}`);
  const uniqIds = [...(uniqQualities || [])].filter(Boolean).sort();
  uniqIds.forEach((id) => parts.push(`uniq_${id}`));
  if (baseName) parts.push(slugifyBaseName(baseName));
  return parts.join('_');
};

const generateStackKey = (weaponId, appliedMods = {}, baseName = '', durability, uniqQualities) =>
  buildKey(weaponId, appliedMods, baseName, durability, uniqQualities);

const modsSignature = (appliedMods) => {
  const ids = Object.values(appliedMods || {}).filter(Boolean).map(String).sort();
  return ids.length ? ids.join('|') : 'none';
};

const isFusionCoreItem = (item) => item?.id === FUSION_CORE_ID || item?.weaponId === FUSION_CORE_ID;
const fusionCoreStackKey = (charges) => `ammo:${FUSION_CORE_ID}:charges:${charges}`;
const isPowerArmorFrame = (item) => item?.itemType === 'powerArmor' && item?.set === PA_FRAME_SET_KEY;

const powerArmorPieceStackKey = (piece) =>
  `powerArmor:${piece.catalogId}:mods:${modsSignature(piece.appliedMods)}:hp:${piece.hpCurrent}`;

const powerArmorFrameStackKey = (frameItem) => {
  const piecesSig = PA_PIECE_SLOTS
    .map((slot) => {
      const p = frameItem.installedPieces?.[slot];
      return p ? `${slot}:${powerArmorPieceStackKey(p)}` : `${slot}:empty`;
    })
    .join('|');
  const coreSig = frameItem.installedCore ? String(frameItem.installedCore.charges) : 'none';
  return `powerArmor:${frameItem.id}:mods:${modsSignature(frameItem.appliedMods)}:pieces:${piecesSig}:core:${coreSig}`;
};

const getItemName = (item) => item?.name || item?.id || '';
const getItemCatalogId = (item) => item?.id || item?.weaponId || item?.itemId
  || item?.armorId || item?.clothingId || item?.code || '';

const getItemType = (item) => {
  if (item?.itemType) return item.itemType;
  if (item?.effectType || item?.durationInScenes || item?.duration || item?.positiveEffect) return 'chem';
  if (item?.type === 'ammo') return 'ammo';
  if (item?.weaponId || item?.damage !== undefined) return 'weapon';
  if (item?.clothingType) return 'clothing';
  if (item?.protectedAreas) return 'armor';
  return 'misc';
};

/**
 * Подпись ЖИВОГО состояния экземпляра. Патч 522: предмет не теряет свойства
 * при смене места хранения, поэтому два экземпляра с разными модами, зарядами,
 * прочностью или уникальными качествами НИГДЕ не склеиваются — ни в инвентаре,
 * ни на складе, ни у торговца.
 */
const stateSignature = (item) => [
  `mods:${modsSignature(item.appliedMods)}`,
  `charges:${item.charges ?? 'none'}`,
  `durability:${item.durability ?? 'none'}`,
  `hp:${item.hpCurrent ?? 'none'}`,
  `uniq:${[...(item.uniqQualities || [])].filter(Boolean).map(String).sort().join('|') || 'none'}`,
  `base:${item.baseName ? slugifyBaseName(item.baseName) : 'none'}`,
].join('|');

/**
 * КАНОНИЧЕСКИЙ ключ стака. Совпадает с законом инвентаря:
 * разные заряды ядерного блока, разные моды, прочность, уникальные качества,
 * состав силовой брони и вариант имени — разные стопки.
 */
const itemStackKey = (item) => {
  if (!item || typeof item !== 'object') return 'plain';
  const state = `state:${stateSignature(item)}`;
  if (isFusionCoreItem(item)) return `${fusionCoreStackKey(item.charges)}|${state}`;
  if (item.itemType === 'powerArmor') {
    const catalogId = item.weaponId || item.id;
    if (isPowerArmorFrame(item)) return `${powerArmorFrameStackKey({ ...item, id: catalogId })}|${state}`;
    return `${powerArmorPieceStackKey({ catalogId, appliedMods: item.appliedMods || {}, hpCurrent: item.hpCurrent })}|${state}`;
  }
  const itemType = getItemType(item);
  if (itemType === 'weapon') {
    const storeKey = item.stackKey || generateStackKey(
      item.weaponId || item.id || getItemName(item),
      item.appliedMods,
      item.baseName,
      item.durabilityTracked ? item.durability : undefined,
      item.uniqQualities,
    );
    return `weapon:${getItemCatalogId(item)}:${storeKey}:mods:${modsSignature(item.appliedMods)}|${state}`;
  }
  return `${itemType}:${getItemCatalogId(item)}|${state}`;
};

// ─── Цена и вес с учётом модов ------------------------------------------------
// Расчёт «эффективного» предмета требует каталога (`resolveEffectiveItem`), он
// доступен только на клиенте. Клиент кладёт в запись effectiveCost/effectiveWeight,
// а сервер, склад и торговец читают их ЧЕРЕЗ ЭТИ ЖЕ функции и больше не теряют.

const toNumber = (value) => {
  const parsed = typeof value === 'string'
    ? parseFloat(value.replace(/\s/g, '').replace(',', '.'))
    : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const effectiveItemCost = (item) => toNumber(
  item?.effectiveCost ?? item?.cost ?? item?.price ?? item?.value ?? 0,
);
const effectiveItemWeight = (item) => toNumber(
  item?.effectiveWeight ?? item?.weight ?? 0,
);

/**
 * Снимок предмета для переноса (инвентарь → склад → торговец → инвентарь).
 * Патч 522: НИКАКОГО обрезания полей. Моды, заряды, прочность, уникальные
 * качества, уникальные id, stackKey, базовое имя — всё остаётся. Меняется только
 * состояние размещения и количество, которое едет отдельным полем операции.
 */
const itemTransferSnapshot = (item, effectiveNumbers = {}) => ({
  ...(item && typeof item === 'object' ? item : {}),
  quantity: 1,
  equipped: false,
  locked: false,
  ...effectiveNumbers,
});

module.exports = {
  FUSION_CORE_ID,
  PA_FRAME_SET_KEY,
  PA_PIECE_SLOTS,
  PROTOCOL_MAX_TRANSFER_OPERATIONS: 50,
  MAX_SNAPSHOT_BYTES,
  sanitizeItemSnapshot,
  isValidQuantity,
  slugifyBaseName,
  buildKey,
  generateStackKey,
  modsSignature,
  isFusionCoreItem,
  fusionCoreStackKey,
  isPowerArmorFrame,
  powerArmorPieceStackKey,
  powerArmorFrameStackKey,
  getItemName,
  getItemCatalogId,
  getItemType,
  itemStackKey,
  stateSignature,
  effectiveItemCost,
  effectiveItemWeight,
  itemTransferSnapshot,
};
