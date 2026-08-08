/**
 * domain/weaponDisplay.js
 * Helpers for resolving weapon display strings (qualities, damageType)
 * from structured data to localized human-readable strings.
 */

import ruQualities from '../i18n/ru-RU/data/system/qualities.json';
import enQualities from '../i18n/en-EN/data/system/qualities.json';
import ruEffects from '../i18n/ru-RU/data/system/damageEffects.json';
import enEffects from '../i18n/en-EN/data/system/damageEffects.json';
import { getCurrentLocale } from '../i18n/locale';

const QUALITY_DICTS = {
  'ru-RU': ruQualities,
  'en-EN': enQualities,
};

const EFFECT_DICTS = {
  'ru-RU': ruEffects,
  'en-EN': enEffects,
};

const DAMAGE_TYPE_LABELS = {
  'ru-RU': {
    physical: 'Физический',
    energy: 'Энергетический',
    radiation: 'Радиационный',
    poison: 'Ядовитый',
    fire: 'Огненный',
    special: 'Особый',
  },
  'en-EN': {
    physical: 'Physical',
    energy: 'Energy',
    radiation: 'Radiation',
    poison: 'Poison',
    fire: 'Fire',
    special: 'Special',
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
 * Локализованный список ЭФФЕКТОВ оружия (effect_* — срабатывают при выпадении
 символа эффекта). В отличие от качеств, эффекты — отдельная сущность.
 Принимает массив {effectId, value?} (или JSON-строку из БД).
 */
export function resolveWeaponEffects(effects) {
  const locale = getCurrentLocale();
  const dict = EFFECT_DICTS[locale] || ruEffects;
  const effectMap = Object.fromEntries(dict.map((e) => [e.id, e.name]));

  let arr = effects;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return arr;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return '';

  return arr
    .map((e) => {
      if (typeof e === 'string') return e;
      if (!e || typeof e !== 'object') return '';
      const name = effectMap[e.effectId] || e.effectId || '';
      if (e.value != null) return `${name} ${e.value}`;
      return name;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Resolves a weapon's damageType to a localized string.
 *
 * Supports:
 *  - Array of strings: ["energy", "physical"] → "Энергетический + Физический"
 *  - JSON string of array: '["energy","physical"]' → "Энергетический + Физический"
 *  - Plain string: "physical" → "Физический"
 *  - null / undefined → ''
 *
 * @param {any} damageType  e.g. ["physical", "energy"], "physical", '["energy"]'
 * @returns {string}
 */
export function resolveWeaponDamageType(damageType) {
  if (!damageType) return '';

  const locale = getCurrentLocale();
  const labels = DAMAGE_TYPE_LABELS[locale] || DAMAGE_TYPE_LABELS['ru-RU'];

  // Parse JSON string if needed
  let arr = damageType;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      // Legacy plain string — return as-is
      return labels[arr] || arr;
    }
  }

  // Support array of damage types
  if (Array.isArray(arr)) {
    if (arr.length === 0) return '';
    return arr
      .map(dt => labels[dt] || dt)
      .join(' + ');
  }

  // Single string value
  return labels[arr] || arr;
}
