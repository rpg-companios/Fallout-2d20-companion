// src/store/selectors.js
// Pure selector functions for reading data from the normalized character store

import { debugLog } from '../engine/debug/runtimeTrace.js';
import { effectsDictToLegacyArray } from './effectsSync.js';
import { getCharacterCreationLogic, getDerivedStatsLogic, getSettingService } from '../../domain/registry.js';

// Setting-derived formulas are resolved at call time. No active setting means
// there is no carry-weight formula, not an implicit setting implementation.
const calculateCarryWeight = (...args) => (
  getDerivedStatsLogic()?.calculateCarryWeight?.(...args) ?? 0
);

// ── Шаг 5 миграции: стор-словари (Parameter-формат) — единственный источник
// атрибутов/навыков. Экранам и снапшоту сейва нужен legacy-массив — выводится
// ЭТИМИ селекторами (одна реализация на провайдер и экраны).

const getParameterFieldNames = () => {
  const settingFields = getSettingService('inventory')?.itemParameterFields;
  return [
    'damage',
    'fireRate',
    ...(Array.isArray(settingFields) ? settingFields.filter((field) => typeof field === 'string') : []),
  ];
};

/**
 * Flatten normalized parameter objects to display values
 */
export const flattenItemParams = (item) => {
  if (!item) return item;
  const flat = { ...item };
  getParameterFieldNames().forEach((field) => {
    if (flat[field] && typeof flat[field] === 'object') {
      flat[field] = flat[field].total ?? flat[field].base;
    }
  });
  return flat;
};

/**
 * Filter items by equipped status
 * @param {object} state - Character store state
 * @param {boolean} equipped - true for equipped items, false for inventory
 */
export const selectItemsByEquipped = (state, equipped) => {
  const matched = Object.values(state.items || {}).filter(
    (item) => Boolean(item.equipped) === equipped,
  );
  debugLog('items.selectByEquipped', {
    total: Object.keys(state.items || {}).length,
    equipped,
    matched: matched.length,
  });
  return matched;
};

/**
 * Filter items by itemType
 * @param {object} state - Character store state
 * @param {string} itemType - a setting-declared item type
 */
export const selectItemsByType = (state, itemType) => {
  return Object.values(state.items || {}).filter(
    (item) => item.itemType === itemType,
  );
};

/**
 * Get total value for an attribute (base + modifiers)
 * @param {object} state - Character store state
 * @param {string} attrId - e.g. 'STR', 'END'
 */
export const selectAttributeTotal = (state, attrId) => {
  return state.attributes?.[attrId]?.total ?? 0;
};

/**
 * Get total value for a skill (base + modifiers)
 * @param {object} state - Character store state
 * @param {string} skillId - Skill name/id
 */
export const selectSkillTotal = (state, skillId) => {
  return state.skills?.[skillId]?.total ?? 0;
};

/**
 * Get active timed effects as legacy array for domain/effects helpers
 */
export const selectActiveTimedEffects = (state) => {
  return effectsDictToLegacyArray(state.effects);
};


/**
 * Convert the normalized attribute map to the legacy display/save shape.
 * If the active setting declares an order, use it; otherwise preserve the
 * engine's stored order without imposing any game's attribute identities.
 */
export const selectLegacyAttributes = ({ attributes = {} } = {}) => {
  const legacy = Object.values(attributes)
    .map((attr) => ({ name: attr.id, value: attr.base }));
  const rules = getCharacterCreationLogic();
  const canonicalKeys = rules?.CANONICAL_ATTRIBUTE_KEYS ?? [];
  if (!canonicalKeys.length) return legacy;

  const canonicalize = rules.getCanonicalAttributeKey ?? ((key) => key);
  const order = new Map(canonicalKeys.map((key, index) => [key, index]));
  return legacy.sort((left, right) => {
    const leftRank = order.get(canonicalize(left.name) ?? left.name);
    const rightRank = order.get(canonicalize(right.name) ?? right.name);
    if (leftRank === rightRank) return 0;
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return leftRank - rightRank;
  });
};

/**
 * Convert normalized skills to the legacy save/display shape. The active
 * setting may supply an ordered catalogue and metadata; the engine otherwise
 * exposes only keys that are actually present in state.
 */
export const selectLegacySkills = ({ skills = {} } = {}) => {
  const catalog = getCharacterCreationLogic()?.ALL_SKILLS ?? [];
  if (catalog.length) {
    return catalog.map((skill) => {
      const stored = skills[skill.name];
      return stored ? { ...skill, value: stored.base } : { ...skill, value: 0 };
    });
  }
  return Object.entries(skills).map(([key, skill]) => ({
    name: skill?.id ?? key,
    value: skill?.base ?? 0,
  }));
};

// ── Шаг 8а миграции: производные живут в derivedStats стора (пересчёт —
// recalculateDerivedStats). Экранам нужен плоский номер — форма поля
// { base, modifiers, total } (или число в старых записях). Без активного
// setting capability селектор возвращает нейтральный ноль.
export const selectCarryWeight = (state) => {
  const raw = state.derivedStats?.carryWeight;
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw.total === 'number') return raw.total;
  const settingContext = getSettingService('perks')?.getCharacterContext?.({
    origin: state.origin,
    trait: state.trait,
    stateExtensions: state.stateExtensions,
    equipmentState: { equippedArmor: state.equippedArmor },
  }) ?? {};
  return calculateCarryWeight(
    selectLegacyAttributes(state),
    state.trait,
    { equippedArmor: state.equippedArmor, ...settingContext },
  );
};
