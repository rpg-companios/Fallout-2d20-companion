// src/store/resolvers.js
// Parameter calculation utilities - pure functions for calculating totals

// --- Attribute Resolvers ---
export const calculateAttributeTotal = (attribute) => {
  if (!attribute) return 0;

  const { base, modifiers = [] } = attribute;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// --- Skill Resolvers ---
export const calculateSkillTotal = (skill) => {
  if (!skill) return 0;

  const { base, modifiers = [] } = skill;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// --- Item Resolvers ---
export const calculateItemParameterTotal = (parameter) => {
  if (!parameter) return 0;

  const { base, modifiers = [] } = parameter;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// Export for use in characterStore.js
export const calculateParameterTotal = (base, modifiers = []) => {
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

const coerceToParameter = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    return { base: value, modifiers: [], total: value };
  }
  if (typeof value === 'object') return value;
  return value;
};

// Пример применения к предмету
export const normalizeItemParameters = (item) => {
  if (!item) return item;

  const normalized = { ...item };

  if (normalized.damage !== undefined) {
    normalized.damage = coerceToParameter(normalized.damage);
    normalized.damage.total = calculateItemParameterTotal(normalized.damage);
  }

  if (normalized.fireRate !== undefined) {
    normalized.fireRate = coerceToParameter(normalized.fireRate);
    normalized.fireRate.total = calculateItemParameterTotal(normalized.fireRate);
  }

  // Пересчет защиты брони
  if (normalized.physicalDamageRating) {
    normalized.physicalDamageRating.total = calculateItemParameterTotal(
      normalized.physicalDamageRating
    );
  }

  if (normalized.energyDamageRating) {
    normalized.energyDamageRating.total = calculateItemParameterTotal(
      normalized.energyDamageRating
    );
  }

  if (normalized.radiationDamageRating) {
    normalized.radiationDamageRating.total = calculateItemParameterTotal(
      normalized.radiationDamageRating
    );
  }

  return normalized;
};


// ---------------------------------------------------------------------------
// Универсальные хелперы параметров (МК-3, патч 316).
// Сюда стянуты чистые механизмы без знаний о сеттинге, чтобы файлы логики
// модуля (modules/fallout/logic/*) могли импортировать их НЕ задевая ни
// реестр, ни characterCreation — файл остаётся полностью чистым (0 импортов).
// Прежние дома оставляют re-export для совместимости.
// ---------------------------------------------------------------------------

// --- Канонические ключи атрибутов (из domain/characterCreation.js) ---

// Слово владельца (2026-09-21): порядок атрибутов SPECIAL — как в правилах,
// и никак иначе: Сила, Восприятие, Выносливость, Харизма, Интеллект, Ловкость,
// Удача. Это не сортировка, а канон показа: любой список атрибутов в программе
// обязан идти в этом порядке. Предохранитель — тест special-attribute-order.
export const CANONICAL_ATTRIBUTE_KEYS = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'];

const ATTRIBUTE_KEY_ALIASES = {
  STR: 'STR',
  END: 'END',
  PER: 'PER',
  AGI: 'AGI',
  INT: 'INT',
  CHA: 'CHA',
  LCK: 'LCK',
};

export const getCanonicalAttributeKey = (key) => ATTRIBUTE_KEY_ALIASES[key] || null;

export const getAttributeValue = (attributes = [], key) => {
  const canonical = getCanonicalAttributeKey(key);
  if (!canonical) return null;
  const found = attributes.find(
    (attr) => getCanonicalAttributeKey(attr.name) === canonical,
  );
  return found?.value ?? 0;
};

// --- Модификаторы грузоподъёмности от снаряжения (из characterCreation.js) ---

const toNumber = (value) => Number(value) || 0;

const sumCarryWeightModifierFromItem = (item) => {
  if (!item) return 0;
  return toNumber(item.carryWeightModifier);
};

export const getEquipmentCarryWeightModifier = ({ equippedArmor, equippedRobotSlots } = {}) => {
  let total = 0;

  if (equippedArmor && typeof equippedArmor === 'object') {
    Object.values(equippedArmor).forEach((slot) => {
      total += sumCarryWeightModifierFromItem(slot?.armor);
      total += sumCarryWeightModifierFromItem(slot?.clothing);
    });
  }

  if (equippedRobotSlots && typeof equippedRobotSlots === 'object') {
    Object.values(equippedRobotSlots).forEach((slot) => {
      total += sumCarryWeightModifierFromItem(slot?.armor);
      total += sumCarryWeightModifierFromItem(slot?.plating);
      total += sumCarryWeightModifierFromItem(slot?.frame);
    });
  }

  return total;
};

// --- Атрибут-модификаторы каркаса силовой брони (из domain/powerArmor.js) ---

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
