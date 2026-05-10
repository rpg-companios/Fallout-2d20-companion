// domain/traits.js
// Pure trait logic: loading data, reading modifiers, display helpers.
// No React, no UI dependencies. All identifiers and code in English.

import traitsJson from '../data/traits/traits.json';
import originsJson from '../data/origins/origins.json';
import ruTraits from '../i18n/ru-RU/data/system/traits.json';
import enTraits from '../i18n/en-EN/data/system/traits.json';
import ruOrigins from '../i18n/ru-RU/data/system/origins.json';
import enOrigins from '../i18n/en-EN/data/system/origins.json';
import { getCurrentLocale } from '../i18n/locale';

const TRAIT_DICTIONARIES = {
  'ru-RU': ruTraits,
  'en-EN': enTraits,
};

const ORIGIN_DICTIONARIES = {
  'ru-RU': ruOrigins,
  'en-EN': enOrigins,
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

/**
 * Returns the localized display name for an origin by its id.
 */
export function tOrigin(id) {
  if (!id) return '';
  const locale = getCurrentLocale();
  const dict = ORIGIN_DICTIONARIES[locale] || ruOrigins;
  return dict[id] || id;
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

/**
 * Returns the full traits array from data/traits/traits.json.
 * Synchronous — JSON is bundled at build time.
 */
export function loadTraitsData() {
  return traitsJson;
}

/**
 * Returns the full origins array from data/origins/origins.json.
 * Synchronous — JSON is bundled at build time.
 */
export function loadOriginsData() {
  return originsJson;
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
  return traitsJson.find((t) => t.id === name);
}

/**
 * Find a trait entry by its id.
 */
export function findTraitById(id) {
  if (!id) return undefined;
  return traitsJson.find((t) => t.id === id);
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
  return traitsJson.find((t) => tTrait(t.displayNameKey) === name);
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
 * Returns fully resolved { name, description } for a trait by id,
 * using the current locale.
 */
export function getTraitI18n(id) {
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
