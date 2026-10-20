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
export const normalizeItemParameters = (item, settingParameterFields = []) => {
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

  for (const field of Array.isArray(settingParameterFields) ? settingParameterFields : []) {
    if (typeof field !== 'string' || !normalized[field]) continue;
    normalized[field] = coerceToParameter(normalized[field]);
    normalized[field].total = calculateItemParameterTotal(normalized[field]);
  }

  return normalized;
};


// ---------------------------------------------------------------------------
// Universal parameter helpers. Setting identity, attribute names, and game
// mechanics are deliberately kept out of this engine-owned module.
// ---------------------------------------------------------------------------
