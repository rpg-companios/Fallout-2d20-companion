// domain/range.js
// Single source of truth for the weapon RANGE ordinal scale.
//
// Range is an ordinal category, not a free string and not a numeric stat:
//   Close (0) → Medium (1) → Long (2) → Extreme (3)
//
// Weapon mods shift the category by +/- steps. Multiple mods stack additively
// (e.g. three +1 mods and one -1 mod = net +2). The result is clamped to the
// scale bounds (cannot go below Close or above Extreme).
//
// Catalog data stores range as a single letter: 'C' | 'M' | 'L' | 'E' (or '' / null).
// Display/UI uses the name key: 'Close' | 'Medium' | 'Long' | 'Extreme'
// (localized via i18n weapon.rangeNames).

export const RANGE_ORDER = ['Close', 'Medium', 'Long', 'Extreme'];

const LETTER_TO_NAME = {
  C: 'Close',
  M: 'Medium',
  L: 'Long',
  E: 'Extreme',
};

const NAME_TO_INDEX = RANGE_ORDER.reduce((acc, name, i) => {
  acc[name] = i;
  return acc;
}, {});

/** Clamp an index into the valid scale [0 .. RANGE_ORDER.length-1]. */
export const clampRangeIndex = (index) =>
  Math.max(0, Math.min(RANGE_ORDER.length - 1, Number(index) || 0));

/**
 * Resolve any range representation (letter 'C', name 'Close', index 0, or a
 * Parameter-like {base/total}) into a 0-based index.
 * Returns null for empty/unknown so callers can decide on a default.
 */
export const rangeToIndex = (value) => {
  if (value == null || value === '') return null;

  // Parameter-ish object (legacy normalized shape) — read base/total.
  if (typeof value === 'object') {
    const inner = value.total ?? value.base;
    return rangeToIndex(inner);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampRangeIndex(value);
  }

  const str = String(value).trim();
  if (str === '') return null;

  // single-letter catalog code
  if (str.length === 1 && LETTER_TO_NAME[str.toUpperCase()]) {
    return NAME_TO_INDEX[LETTER_TO_NAME[str.toUpperCase()]];
  }

  // full name (case-insensitive)
  const nameKey = RANGE_ORDER.find((n) => n.toLowerCase() === str.toLowerCase());
  if (nameKey) return NAME_TO_INDEX[nameKey];

  return null;
};

/** Index → canonical name key ('Close' | 'Medium' | 'Long' | 'Extreme'). */
export const indexToRangeName = (index) => RANGE_ORDER[clampRangeIndex(index)];

/** Any representation → canonical name key, or null if unknown/empty. */
export const rangeToName = (value) => {
  const idx = rangeToIndex(value);
  return idx == null ? null : indexToRangeName(idx);
};

/**
 * Shift a range by N steps (mods), clamped to the scale.
 * @param {*} value - starting range (letter/name/index)
 * @param {number} steps - net step delta (e.g. +2, -1)
 * @returns {{ index: number, name: string }}
 */
export const shiftRange = (value, steps = 0) => {
  const baseIdx = rangeToIndex(value) ?? 0;
  const idx = clampRangeIndex(baseIdx + (Number(steps) || 0));
  return { index: idx, name: indexToRangeName(idx) };
};

/**
 * Base (unmodified) range index of a weapon-like object.
 *
 * Only MECHANICAL sources are read, in this order:
 *   1. `range` — catalog code 'C' | 'M' | 'L' | 'E' (single letter);
 *   2. `range_name` / `rangeName` — canonical English key ('Close' … 'Extreme');
 *   3. `range_index` — number (a resolved value; may already include mod shifts,
 *      therefore it is only a last resort).
 *
 * Localized display text is NOT mechanical: i18n weapon catalogs carry
 * `rangeName: "Средняя"` / `"Близкая"`, and parsing it as a range used to
 * collapse the range to Close (bug: «Короткий оптический» on the hunting
 * rifle lowered «Средняя» to «Близкая»). Such strings simply do not match.
 *
 * Returns null when the object has no mechanical range (e.g. melee weapons).
 */
export const baseRangeIndex = (weapon = {}) => {
  if (!weapon || typeof weapon !== 'object') return null;
  const fromCode = rangeToIndex(weapon.range);
  if (fromCode != null) return fromCode;
  const fromName = rangeToIndex(weapon.range_name ?? weapon.rangeName);
  if (fromName != null) return fromName;
  return rangeToIndex(weapon.range_index);
};

/**
 * Normalize a weapon-like object so it carries consistent range fields:
 *   range_index (number) and range_name (canonical key).
 * Does NOT mutate the input; returns a shallow patch object.
 * Safe for catalog weapons (range: 'C') and already-resolved weapons.
 */
export const resolveWeaponRangeFields = (weapon = {}) => {
  // An explicit resolved index wins. Otherwise read mechanical sources in
  // baseRangeIndex order — the letter comes BEFORE rangeName, because the
  // i18n catalog's rangeName is localized display text («Средняя»).
  let idx = null;
  if (weapon.range_index != null && weapon.range_index !== '') {
    idx = clampRangeIndex(weapon.range_index);
  } else {
    idx = baseRangeIndex(weapon);
  }

  if (idx == null) {
    // Unknown/empty range: leave undefined so UI can show its "empty" label.
    return { range_index: undefined, range_name: undefined };
  }

  return { range_index: idx, range_name: indexToRangeName(idx) };
};
