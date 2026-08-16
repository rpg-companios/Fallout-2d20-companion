// domain/enrichItem.js
// ЕДИНЫЙ КОНВЕЙЕР ОБОГАЩЕНИЯ ПРЕДМЕТА (дизайн: docs/architecture/item-enrichment-pipeline.md).
//
// Проблема, которую решает: имя и статы модифицированного оружия собирались
// в трёх независимых местах (kitResolver, resolveItem, WeaponsAndArmorScreen)
// с разными правилами — отсюда баги «в одном месте так, в другом иначе»
// (имя без модов, моды не считались, новые моды не ставились).
//
// Конвейер — ЧИСТЫЙ модуль (без React/БД/локали): каталог и словарь имён
// качеств передаются аргументами. Этапы:
//   1. BASE      — каталожная запись по canonicalId (варианты: trueItemId →
//                  механика истинного предмета берётся каталогом);
//   2. MODS      — применённые моды (appliedMods): статы + имя;
//   3. QUALITIES — uniqQualities: имена качеств в displayName (эффекты — резерв);
//   4. PROPERTIES — зарезервировано (свойства крафта и т.п.).
//
// Правила имени (решения владельца, 2026-08-15):
//   [префиксы модов] [имена качеств] [базовое имя]
//   - качества ВСЕГДА добавляются (не заменяют имя);
//   - мод слота Stocks меняет базовое имя на stockNames.with ТОЛЬКО если
//     оно задано в данных (единичные случаи: пистолет → винтовка);
//     иначе ложа — обычный мод со своим префиксом;
//   - базовое имя: baseName варианта → stockNames.with (stock-мод) →
//     stockNames.without → каталожное имя.

import { clampRangeIndex, indexToRangeName } from './range.js';

const toNumber = (value) => {
  const n = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Нормализация массива качеств/эффектов: массив записей или JSON-строка. */
const toEntryArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** Числовой модификатор { op: '+', value } | { op: '-', value } | { op: 'set', value }. */
export const applyNumberModifier = (baseValue, modifier) => {
  if (!modifier) return baseValue;
  const base = toNumber(baseValue);
  const delta = toNumber(modifier.value);
  if (modifier.op === 'set') return delta;
  if (modifier.op === '-') return Math.max(0, base - delta);
  return base + delta;
};

const applyQualityGain = (map, change) => {
  // Стековые качества: повторный gain повышает уровень (value суммируется).
  const id = change?.qualityId ?? change?.id;
  if (!id) return;
  const existing = map.get(id);
  if (existing?.value != null || change.value != null) {
    const level = toNumber(existing?.value) + toNumber(change.value);
    map.set(id, { qualityId: id, value: level });
  } else {
    map.set(id, { qualityId: id });
  }
};

/**
 * Применить моды оружия к базовой записи: ВСЕ структурированные поля мода
 * (единая механика — как в модалке модификации):
 * damageModifier, fireRateModifier, rangeModifier, effectChanges,
 * qualityChanges, damageTypeOverride, ammoOverride, weight, cost,
 * ammoPerShotDelta.
 */
export const applyWeaponMods = (baseWeapon, mods = []) => {
  const result = { ...baseWeapon };

  let damage = toNumber(result.damage);
  let fireRate = toNumber(result.fireRate);
  let rangeShift = 0;
  let ammoId = result.ammoId;
  let damageType = Array.isArray(result.damageType)
    ? [...result.damageType]
    : result.damageType
      ? [result.damageType]
      : [];
  let weight = toNumber(result.weight);
  let cost = toNumber(result.cost);
  let ammoPerShot = toNumber(result.ammoPerShot ?? result.ammoPerShotDelta ?? 0);

  const qualities = new Map();
  toEntryArray(result.qualities).forEach((entry) => {
    const id = typeof entry === 'object' && entry ? (entry.qualityId ?? entry.id) : entry;
    if (id && id !== '–') {
      qualities.set(id, entry?.value != null ? { qualityId: id, value: entry.value } : { qualityId: id });
    }
  });
  const effects = new Map();
  toEntryArray(result.effects).forEach((entry) => {
    const id = typeof entry === 'object' && entry ? (entry.effectId ?? entry.id) : entry;
    if (id && id !== '–') {
      effects.set(id, entry?.value != null ? { effectId: id, value: entry.value } : { effectId: id });
    }
  });

  for (const mod of mods) {
    if (mod.damageModifier) damage = applyNumberModifier(damage, mod.damageModifier);
    if (mod.fireRateModifier) fireRate = applyNumberModifier(fireRate, mod.fireRateModifier);
    if (mod.rangeModifier) {
      const steps = toNumber(mod.rangeModifier.value);
      rangeShift += mod.rangeModifier.op === '-' ? -steps : steps;
    }
    if (Array.isArray(mod.effectChanges)) {
      for (const change of mod.effectChanges) {
        const id = change.id;
        if (!id) continue;
        if (change.op === 'lose') effects.delete(id);
        else effects.set(id, change.value != null ? { effectId: id, value: change.value } : { effectId: id });
      }
    }
    if (Array.isArray(mod.qualityChanges)) {
      for (const change of mod.qualityChanges) {
        const id = change.id ?? change.qualityId;
        if (!id) continue;
        if (change.op === 'lose') qualities.delete(id);
        else applyQualityGain(qualities, { qualityId: id, value: change.value });
      }
    }
    if (mod.damageTypeOverride) {
      const { op, value } = mod.damageTypeOverride;
      if (op === 'set') {
        damageType = Array.isArray(value) ? [...value] : [value];
      } else if (op === 'add') {
        for (const t of (Array.isArray(value) ? value : [value])) {
          if (!damageType.includes(t)) damageType.push(t);
        }
      }
    }
    if (mod.ammoOverride) ammoId = mod.ammoOverride;
    if (mod.weight != null) weight += toNumber(mod.weight);
    if (mod.cost != null) cost += toNumber(mod.cost);
    if (mod.ammoPerShotDelta != null) ammoPerShot += toNumber(mod.ammoPerShotDelta);
  }

  const rangeIndex = clampRangeIndex(
    (result.range_index != null && result.range_index !== ''
      ? toNumber(result.range_index)
      : (result.range_name || result.rangeName || result.range || 'Close')) + rangeShift,
  );

  return {
    ...result,
    damage,
    fireRate,
    weight,
    cost,
    ammoId,
    ammoPerShot,
    damageType,
    qualities: [...qualities.values()],
    effects: [...effects.values()],
    range_index: rangeIndex,
    range_name: indexToRangeName(rangeIndex),
  };
};

/**
 * Единое имя предмета: [префиксы модов] [имена качеств] [базовое имя].
 * @param {object} params
 * @param {string} params.baseName      — базовое имя (вариант → stock → каталог)
 * @param {string[]} params.modPrefixes — префиксы применённых модов
 * @param {string[]} params.qualityNames — имена уникальных качеств
 */
export const getItemDisplayName = ({ baseName = '', modPrefixes = [], qualityNames = [] }) =>
  [...modPrefixes, ...qualityNames, baseName].filter(Boolean).join(' ');

/**
 * Полный конвейер оружия: база из каталога + моды (статы и имя) + качества.
 * Возвращает запись, совместимую с карточкой/экранами (поля instance
 * сохраняются, имя — displayName).
 *
 * @param {object} weaponLike — запись с полями weaponId/id, appliedMods,
 *                              baseName?, uniqQualities? и экземплярными полями
 * @param {object} catalog    — getEquipmentCatalog(locale)
 * @param {object} [opts]
 * @param {Function} [opts.qualityNameById] — (id) => string | '' (имена качеств)
 */
export const enrichWeaponItem = (weaponLike, catalog, opts = {}) => {
  if (!weaponLike || !catalog) return weaponLike;
  const catalogId = weaponLike.weaponId || weaponLike.id;
  if (!catalogId) return weaponLike;

  const catalogEntry = (catalog.weapons || []).find((w) => w.id === catalogId) || null;
  if (!catalogEntry) return weaponLike;

  // Вариант (trueItemId): механика — из истинного предмета в том же каталоге
  // (модуль самодостаточен); имя варианта — из baseName (шаг имени ниже).
  const base = (catalogEntry.trueItemId
    ? (catalog.weapons || []).find((w) => w.id === catalogEntry.trueItemId) || catalogEntry
    : catalogEntry);

  const modIds = Object.values(weaponLike.appliedMods || {}).filter(Boolean);
  const mods = modIds
    .map((modId) => (catalog.weaponMods || []).find((mod) => mod?.id === modId))
    .filter(Boolean);

  const effective = mods.length ? applyWeaponMods(base, mods) : base;

  // Имя: правила владельца (см. шапку модуля).
  const hasStockRename = mods.some((mod) => mod.slot === 'Stocks' && base.stockNames?.with);
  const stockName = hasStockRename ? base.stockNames.with : null;
  const baseName = weaponLike.baseName
    || stockName
    || base.stockNames?.without
    || base.name
    || weaponLike.baseWeaponName
    || weaponLike.name
    || '';
  const modPrefixes = mods
    .filter((mod) => !(mod.slot === 'Stocks' && hasStockRename))
    .map((mod) => mod.prefix)
    .filter(Boolean);
  const qualityNameById = opts.qualityNameById || (() => '');
  const qualityNames = (weaponLike.uniqQualities || [])
    .map(qualityNameById)
    .filter(Boolean);
  const displayName = getItemDisplayName({ baseName, modPrefixes, qualityNames });

  return {
    ...weaponLike,
    ...effective,
    name: displayName,
    displayName,
    baseWeaponName: weaponLike.baseName || base.stockNames?.without || base.name || weaponLike.baseWeaponName,
    appliedMods: weaponLike.appliedMods || {},
  };
};
