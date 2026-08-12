// domain/traits.js
// Pure trait logic: loading data, reading modifiers, display helpers.
// No React, no UI dependencies. All identifiers and code in English.
//
// Origins-related helpers (loadOriginsData, tOrigin) have moved to
// domain/origins.js — see that module.

import { getTraits, getTraitI18n } from './registry';
import { getCurrentLocale } from '../i18n/locale';

const TRAIT_DICTIONARIES = {
  'ru-RU': getTraitI18n('ru-RU'),
  'en-EN': getTraitI18n('en-EN'),
};

/**
 * Resolves a dot-separated i18n key like "traits.brotherhood.chainThatBinds.name"
 * against the current locale's traits dictionary.
 */
export function tTrait(key) {
  if (!key) return '';
  const locale = getCurrentLocale();
  const dict = TRAIT_DICTIONARIES[locale] || ruTraits;
  const parts = key.split('.');
  let current = dict;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return key;
  }
  return typeof current === 'string' ? current : key;
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

/**
 * Returns the full traits array from data/traits/traits.json.
 * Synchronous — JSON is bundled at build time.
 */
export function loadTraitsData() {
  return getTraits();
}

// ---------------------------------------------------------------------------
// Trait lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find a trait entry by its id.
 * Returns undefined if not found.
 */
export function findTraitByName(name) {
  if (!name) return undefined;
  return getTraits().find((t) => t.id === name);
}

/**
 * Find a trait entry by its id.
 */
export function findTraitById(id) {
  if (!id) return undefined;
  return getTraits().find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/**
 * Returns the modifiers object for a trait.
 * Accepts either a trait data object (from JSON) or a runtime trait object
 * (which has a `name` field matching cyrillicName and a `modifiers` field).
 *
 * @param {object} trait - trait object (runtime or data)
 * @returns {object} modifiers map (never null)
 */
export function getTraitModifiers(trait) {
  if (!trait) return {};

  // Runtime trait objects already carry modifiers directly
  if (trait.modifiers && typeof trait.modifiers === 'object') {
    return trait.modifiers;
  }

  // Data-layer trait (from JSON) — modifiers are on the object itself
  const dataEntry = findTraitByName(trait.name) || findTraitById(trait.id);
  return dataEntry?.modifiers ?? {};
}

/**
 * Returns attribute min/max limits imposed by a trait.
 * Shape: { STR: { min, max }, END: { min, max }, ... }
 * Only attributes that have overrides are included.
 */
export function getTraitAttributeLimits(trait) {
  const modifiers = getTraitModifiers(trait);
  const result = {};

  // Legacy flat format: minLimits / maxLimits maps
  const minLimits = modifiers.minLimits || {};
  const maxLimits = modifiers.maxLimits || {};

  // New JSON format: attributes[key].min / attributes[key].max
  const attrMods = modifiers.attributes || {};
  for (const [key, val] of Object.entries(attrMods)) {
    if (val && (val.min !== undefined || val.max !== undefined)) {
      result[key] = {
        min: val.min ?? minLimits[key],
        max: val.max ?? maxLimits[key],
      };
    }
  }

  // Merge legacy flat limits for keys not already covered
  for (const [key, val] of Object.entries(minLimits)) {
    if (!result[key]) result[key] = {};
    result[key].min = val;
  }
  for (const [key, val] of Object.entries(maxLimits)) {
    if (!result[key]) result[key] = {};
    result[key].max = val;
  }

  return result;
}

/**
 * Returns the list of immunities granted by a trait.
 * @returns {string[]} e.g. ['radiation', 'poison']
 */
export function getTraitImmunities(trait) {
  const modifiers = getTraitModifiers(trait);
  return Array.isArray(modifiers.immunities) ? modifiers.immunities : [];
}

/**
 * Returns the max skill rank allowed by a trait (default 6).
 */
export function getTraitSkillMaxValue(trait) {
  const modifiers = getTraitModifiers(trait);
  return modifiers.skillMaxValue ?? 6;
}

/**
 * Returns the number of extra tagged skills granted by a trait (default 0).
 */
export function getTraitExtraSkills(trait) {
  const modifiers = getTraitModifiers(trait);
  return modifiers.extraSkills ?? 0;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Returns the i18n key for the trait's display description.
 * Callers should pass this key to their t() function.
 *
 * For runtime trait objects that carry a pre-built description string,
 * the function returns the descriptionKey from the data layer if available,
 * falling back to the trait's own descriptionKey field.
 *
 * @param {object} trait - runtime or data trait object
 * @returns {string} i18n key, or empty string if not found
 */
/**
 * Find a trait whose localized display name (in current locale) matches the
 * given string. Used to resolve runtime trait objects that only carry the
 * localized `name` (e.g. set via handleSelectTrait), without id/descriptionKey.
 */
function findTraitByLocalizedName(name) {
  if (!name) return undefined;
  return getTraits().find((t) => tTrait(t.displayNameKey) === name);
}

export function getTraitDescriptionKey(trait) {
  if (!trait) return '';
  const dataEntry =
    findTraitByName(trait.name) ||
    findTraitById(trait.id) ||
    findTraitByLocalizedName(trait.name);
  const key = dataEntry?.descriptionKey || trait.descriptionKey || '';
  return tTrait(key) || key;
}

export function getTraitNameKey(trait) {
  if (!trait) return '';
  const dataEntry = findTraitByName(trait.name) || findTraitById(trait.id);
  const key = dataEntry?.displayNameKey || trait.displayNameKey || '';
  return tTrait(key) || key;
}

/**
 * Resolves a trait display name for the current locale from a stored (potentially
 * stale-locale) name string. Scans all locale dictionaries to find the matching trait,
 * then returns the name in the current locale. Falls back to the stored name.
 *
 * @param {string} storedName - trait name as saved in character state (any locale)
 * @returns {string} display name in current locale
 */
export function resolveTraitDisplayName(storedName) {
  if (!storedName) return '';
  // Fast path: stored name already matches current locale
  const byCurrentLocale = findTraitByLocalizedName(storedName);
  if (byCurrentLocale) return tTrait(byCurrentLocale.displayNameKey) || storedName;
  // Slow path: try every locale dictionary to find the matching trait
  const found = getTraits().find((t) =>
    Object.values(TRAIT_DICTIONARIES).some((dict) => {
      const parts = t.displayNameKey.split('.');
      let val = dict;
      for (const p of parts) { val = val?.[p]; }
      return typeof val === 'string' && val === storedName;
    })
  );
  if (!found) return storedName;
  return tTrait(found.displayNameKey) || storedName;
}

/**
 * Returns fully resolved { name, description } for a trait by id,
 * using the current locale.
 * (Назван по id, чтобы не конфликтовать с getTraitI18n(locale) из реестра —
 * словарём локали.)
 */
export function getTraitI18nById(id) {
  const dataEntry = findTraitById(id);
  if (!dataEntry) return { name: id, description: '' };
  return {
    name: tTrait(dataEntry.displayNameKey),
    description: tTrait(dataEntry.descriptionKey),
  };
}

export function getTraitDisplayDescription(trait) {
  return getTraitDescriptionKey(trait);
}

// ---------------------------------------------------------------------------
// weaponDamageBonus — universal modifier
// ---------------------------------------------------------------------------
//
// Contract: see docs/schema/06-modifiers.md § 1.7 (`weaponDamageBonus`).
//
// Shape on a source (trait / perk / chem effect):
//   "modifiers": {
//     "weaponDamageBonus": [
//       { "weaponIds": ["weapon_a","weapon_b"], "bonus": 1 },
//       { "weaponId":  "weapon_c",              "bonus": 2 },
//       { "skillKey":  "BIG_GUNS",              "bonus": -1 }
//     ]
//   }
//
// Matching rules per record:
//   - weaponIds: weapon.id ∈ weaponIds
//   - weaponId:  weapon.id === weaponId
//   - skillKey:  weapon.mainSkill === skillKey  (canonical UPPER_SNAKE_CASE)
// At least one rule must match for the record to apply. Multiple matching
// records inside one source are summed (additive). bonus may be negative.

const matchesWeapon = (rule, weapon) => {
  if (!rule || !weapon) return false;
  if (Array.isArray(rule.weaponIds) && weapon.id != null && rule.weaponIds.includes(weapon.id)) return true;
  if (rule.weaponId != null && weapon.id === rule.weaponId) return true;
  if (rule.skillKey != null && weapon.mainSkill === rule.skillKey) return true;
  return false;
};

/**
 * Damage bonus contributed by a single source (trait / perk / chem effect)
 * for a given weapon. Returns 0 when there are no matching records.
 */
export function getWeaponDamageBonus(source, weapon) {
  const rules = source?.modifiers?.weaponDamageBonus;
  if (!Array.isArray(rules) || rules.length === 0) return 0;
  let total = 0;
  for (const rule of rules) {
    if (matchesWeapon(rule, weapon)) {
      total += Number(rule.bonus) || 0;
    }
  }
  return total;
}

/**
 * Sum of weaponDamageBonus contributions across multiple active sources
 * (trait + sub-traits + perks + chem effects, ...). Each source is read
 * independently and the bonuses are added together.
 */
export function getWeaponDamageBonusFromSources(sources, weapon) {
  if (!Array.isArray(sources) || sources.length === 0) return 0;
  let total = 0;
  for (const source of sources) {
    total += getWeaponDamageBonus(source, weapon);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Выбранные под-трейты мульти-ориджинов (NCR/Survivor/Tribal)
// ---------------------------------------------------------------------------

/**
 * Возвращает data-записи всех выбранных под-трейтов персонажа (trait.ids),
 * плюс сам трейт. Пусто, если их нет.
 */
export function getSelectedSubTraits(trait) {
  if (!trait) return [];
  const ids = Array.isArray(trait.ids) ? trait.ids : (trait.id ? [trait.id] : []);
  const found = [];
  for (const id of ids) {
    const entry = findTraitById(id);
    if (entry) found.push(entry);
  }
  return found;
}

/**
 * Навыки, которые нельзя ОТМЕТИТЬ (tag) — union по всем выбранным трейтам.
 * (Очки вкладывать можно, отметить нельзя — правило владельца.)
 */
export function getBannedTagSkills(trait) {
  const banned = new Set();
  for (const t of getSelectedSubTraits(trait)) {
    for (const skill of (t?.modifiers?.bannedTagSkills || [])) banned.add(skill);
  }
  return [...banned];
}

/**
 * Есть ли у выбранных трейтов эффект с данным id (например, rite_of_passage).
 */
export function hasTraitEffect(trait, effectId) {
  if (!effectId) return false;
  return getSelectedSubTraits(trait).some((t) =>
    (t?.modifiers?.effects || []).includes(effectId),
  );
}
