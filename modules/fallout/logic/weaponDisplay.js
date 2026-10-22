/**
 * modules/fallout/logic/weaponDisplay.js
 * Helpers for resolving weapon display strings (qualities, damageType)
 * from structured data to localized human-readable strings.
 */

import { getCurrentModuleLocale } from 'engine:i18n/locale';
import { getFalloutModuleI18n } from './settingI18n.js';

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
// 387: локале-явная форма для переиспользования (строка базовых
// характеристик предмета — domain/itemBasics.js); resolveWeaponQualities
// ниже — обёртка над ней с текущей локалью (поведение прежнее).
export function weaponQualitiesLabel(qualities, locale = getCurrentModuleLocale()) {
  const dict = getFalloutModuleI18n(locale)?.qualities ?? [];
  const qualityMap = Object.fromEntries(dict.map((quality) => [quality.id, quality.name]));

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
export function weaponEffectsLabel(effects, locale = getCurrentModuleLocale()) {
  const dict = getFalloutModuleI18n(locale)?.damageEffects ?? [];
  const effectMap = Object.fromEntries(dict.map((effect) => [effect.id, effect.name]));

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

export function resolveWeaponEffects(effects) {
  return weaponEffectsLabel(effects, getCurrentModuleLocale());
}

export function resolveWeaponQualities(qualities) {
  return weaponQualitiesLabel(qualities, getCurrentModuleLocale());
}

/** Локализованное имя боеприпаса; неизвестный id — как есть. */
export function resolveAmmoName(ammoId, locale = getCurrentModuleLocale()) {
  if (!ammoId) return '';
  const ammoTypes = getFalloutModuleI18n(locale)?.ammoTypes ?? [];
  return ammoTypes.find((item) => item.id === ammoId)?.name || ammoId;
}

export const getFalloutWeaponAmmoNames = (item, catalog) => String(item?.ammoId ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id && id !== 'ammo_anything')
  .map((ammoId) => catalog?.ammoTypes?.find((ammo) => ammo.id === ammoId)?.name)
  .filter(Boolean);

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

  const locale = getCurrentModuleLocale();
  const labels = DAMAGE_TYPE_LABELS[locale];
  if (!labels) {
    throw new Error(`[weaponDisplay] Для языка сеттинга "${locale}" нет словаря типов урона`);
  }

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

// ---------------------------------------------------------------------------
// Порядок оружия на экране снаряжения (ПРАВИЛО владельца):
//   0. виртуальная рукопашная атака (Unarmed: кулаки/манипулятор) — ВСЕГДА
//      в 1-м слоте, для всех ориджинов, независимо от надетого оружия;
//   1. рукопашное оружие (Melee: ножи, кастеты — это предмет инвентаря);
//   2. встроенное оружие конечностей (лазер/ПП секьюритрона и т.п.);
//   3. нерабочее Mk II оружие (требует установки драйвера) — после встроенного;
//   4. всё остальное (стрелковое, экипированное из инвентаря) — в конце.
// Сортировка стабильная: порядок внутри групп сохраняется.
// ---------------------------------------------------------------------------

export const getWeaponDisplayPriority = (weapon) => {
  if (!weapon) return 4;
  const weaponType = weapon?.weaponType;
  if (weaponType === 'Unarmed') return 0;
  if (weaponType === 'Melee') return 1;
  if (weapon?.requiresMkII) return 3;
  if (weapon?.isBuiltin || weapon?.isManipulator) return 2;
  return 4;
};

export const sortWeaponsForDisplay = (weapons = []) =>
  [...weapons].sort((a, b) => getWeaponDisplayPriority(a) - getWeaponDisplayPriority(b));

// ---------------------------------------------------------------------------
// Патч 383: описание улучшения ДЛЯ ЧЕЛОВЕКА — генерируется из механики мода
// (damageModifier, fireRateModifier, rangeModifier, effectChanges,
// qualityChanges, damageTypeOverride, ammoOverride, ammoPerShotDelta, вес,
// цена). В i18n-записях модов описаний нет (только id+name) — «как понять,
// что делает мод?» решается генерацией из данных, а не рукописными строками.
// Словари качеств/эффектов/типов урона — те же, что для карточек (выше).
// ---------------------------------------------------------------------------

const MOD_STAT_LABELS = {
  'ru-RU': {
    damage: 'Урон', fireRate: 'Скорострельность', range: 'Дальность',
    damageType: 'Тип урона', effect: 'Эффект', quality: 'Качество',
    weight: 'Вес', cost: 'Цена', ammoPerShot: 'Расход боеприпасов',
    ammo: 'Боеприпас', loses: 'Теряет',
  },
  'en-EN': {
    damage: 'Damage', fireRate: 'Fire rate', range: 'Range',
    damageType: 'Damage type', effect: 'Effect', quality: 'Quality',
    weight: 'Weight', cost: 'Cost', ammoPerShot: 'Ammo per shot',
    ammo: 'Ammo', loses: 'Loses',
  },
};

const rangeStepsLabel = (locale, n) => {
  const abs = Math.abs(n);
  if (locale === 'ru-RU') {
    const word = abs % 10 === 1 && abs % 100 !== 11 ? 'шаг'
      : [2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100) ? 'шага' : 'шагов';
    return `${word}`;
  }
  return abs === 1 ? 'step' : 'steps';
};

const fmtModValue = (n) => {
  const rounded = Math.round(n * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

/**
 * Человеческое описание изменений мода: «Урон +2 · Вес +6». Чистая функция
 * (кроме словарей-констант): каталог не нужен, локаль — аргументом.
 *
 * @param {object} mod — запись мода (каталог/БД/нормализованная строка модалки)
 * @param {string} [locale] — по умолчанию текущая локаль сеттинга
 * @returns {string} '' — если у мода нет ни одного механического поля
 */
export function describeWeaponModChanges(mod, locale = getCurrentModuleLocale()) {
  if (!mod || typeof mod !== 'object') return '';
  const L = MOD_STAT_LABELS[locale] || MOD_STAT_LABELS['en-EN'];
  const settingI18n = getFalloutModuleI18n(locale);
  const num = (v) => {
    const n = Number(String(v ?? 0).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const parts = [];

  const operationLabel = (modifier) => {
    const value = num(modifier.value);
    if (modifier.op === '+') return fmtModValue(value);
    if (modifier.op === '-') return fmtModValue(-value);
    if (modifier.op === '*') return `×${value}`;
    if (modifier.op === '/') return `÷${value}`;
    if (modifier.op === 'set') return `: ${value}`;
    return String(value);
  };
  const numMod = (label, modifier) => {
    if (!modifier) return;
    if (modifier.op === 'set') parts.push(`${label}: ${num(modifier.value)}`);
    else parts.push(`${label} ${operationLabel(modifier)}`);
  };
  numMod(L.damage, mod.damageModifier);
  numMod(L.fireRate, mod.fireRateModifier);
  if (mod.rangeModifier) {
    const steps = num(mod.rangeModifier.value);
    if (['+', '-'].includes(mod.rangeModifier.op) && steps) {
      const sign = mod.rangeModifier.op === '-' ? -steps : steps;
      parts.push(`${L.range} ${fmtModValue(sign)} ${rangeStepsLabel(locale, sign)}`);
    } else if (['*', '/'].includes(mod.rangeModifier.op)) {
      parts.push(`${L.range} ${operationLabel(mod.rangeModifier)}`);
    }
  }

  const typeLabels = DAMAGE_TYPE_LABELS[locale] || {};
  const typeLabel = (t) => typeLabels[t] || t;
  if (mod.damageTypeOverride) {
    const values = Array.isArray(mod.damageTypeOverride.value)
      ? mod.damageTypeOverride.value
      : [mod.damageTypeOverride.value];
    const names = values.map(typeLabel).filter(Boolean).join(', ');
    parts.push(mod.damageTypeOverride.op === 'add' ? `${L.damageType}: + ${names}` : `${L.damageType}: ${names}`);
  } else if (mod.damageType) {
    parts.push(`${L.damageType}: ${typeLabel(mod.damageType)}`);
  }

  const effectMap = Object.fromEntries((settingI18n?.damageEffects ?? []).map((effect) => [effect.id, effect.name]));
  (mod.effectChanges || []).forEach((change) => {
    if (!change?.id) return;
    const name = effectMap[change.id] || change.id;
    const level = change.value != null ? ` ${change.value}` : '';
    if (change.op === 'lose') parts.push(`${L.loses}: ${name}`);
    else parts.push(`${L.effect}: ${name}${level}`);
  });
  const qualityMap = Object.fromEntries((settingI18n?.qualities ?? []).map((quality) => [quality.id, quality.name]));
  (mod.qualityChanges || []).forEach((change) => {
    const id = change?.id ?? change?.qualityId;
    if (!id) return;
    const name = qualityMap[id] || id;
    const level = change.value != null ? ` ${change.value}` : '';
    if (change.op === 'lose') parts.push(`${L.loses} ${L.quality.toLowerCase()}: ${name}`);
    else parts.push(`${L.quality}: ${name}${level}`);
  });

  if (mod.weightModifier) parts.push(`${L.weight} ${operationLabel(mod.weightModifier)}`);
  else if (mod.weight != null && num(mod.weight)) parts.push(`${L.weight} ${fmtModValue(num(mod.weight))}`);
  if (mod.costModifier) parts.push(`${L.cost} ${operationLabel(mod.costModifier)}`);
  else if (mod.cost != null && num(mod.cost)) parts.push(`${L.cost} ${fmtModValue(num(mod.cost))}`);
  if (mod.ammoPerShotDelta != null && num(mod.ammoPerShotDelta)) {
    parts.push(`${L.ammoPerShot} ${fmtModValue(num(mod.ammoPerShotDelta))}`);
  }
  if (mod.ammoOverride) {
    const name = settingI18n?.ammoTypes?.find((item) => item.id === mod.ammoOverride)?.name || mod.ammoOverride;
    parts.push(`${L.ammo}: ${name}`);
  }

  return parts.join(' · ');
}

/** Строка описания мода для модалки: рукописное — важнее, иначе генерация. */
export const weaponModRowDescription = (row) =>
  row?.effectDescription || row?.effects || describeWeaponModChanges(row);
