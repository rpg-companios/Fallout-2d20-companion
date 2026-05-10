/**
 * domain/weaponDisplay.js
 * Helpers for resolving weapon display strings (qualities, damageType)
 * from structured data to localized human-readable strings.
 */

import ruQualities from '../i18n/ru-RU/data/system/qualities.json';
import enQualities from '../i18n/en-EN/data/system/qualities.json';
import { getCurrentLocale } from '../i18n/locale';

const QUALITY_DICTS = {
  'ru-RU': ruQualities,
  'en-EN': enQualities,
};

const DAMAGE_TYPE_LABELS = {
  'ru-RU': {
    physical: 'Физический',
    energy: 'Энергетический',
    radiation: 'Радиационный',
    poison: 'Ядовитый',
    fire: 'Огненный',
  },
  'en-EN': {
    physical: 'Physical',
    energy: 'Energy',
    radiation: 'Radiation',
    poison: 'Poison',
    fire: 'Fire',
  },
};

/**
 * Resolves a weapon's qualities array to a localized comma-separated string.
 *
 * Accepts:
 *  - Array of { qualityId, value? }  (new data/ format)
 *  - JSON string of the above        (from DB)
 *  - Plain string                    (legacy)
 *  - null / undefined
 *
 * @param {any} qualities
 * @returns {string}
 */
export function resolveWeaponQualities(qualities) {
  const locale = getCurrentLocale();
  const dict = QUALITY_DICTS[locale] || ruQualities;
  const qualityMap = Object.fromEntries(dict.map((q) => [q.id, q.name]));

  let arr = qualities;

  // Parse JSON string from DB
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return arr; // legacy plain string — return as-is
    }
  }

  if (!Array.isArray(arr) || arr.length === 0) return '';

  return arr
    .map((q) => {
      if (typeof q === 'string') return q;
      if (!q || typeof q !== 'object') return '';
      const name = qualityMap[q.qualityId] || q.qualityId || '';
      if (q.value != null) return `${name} ${q.value}`;
      return name;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Resolves a weapon's damageType key to a localized string.
 *
 * @param {string} damageType  e.g. "physical", "energy"
 * @returns {string}
 */
export function resolveWeaponDamageType(damageType) {
  if (!damageType) return '';
  const locale = getCurrentLocale();
  const labels = DAMAGE_TYPE_LABELS[locale] || DAMAGE_TYPE_LABELS['ru-RU'];
  return labels[damageType] || damageType;
}
