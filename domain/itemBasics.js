// domain/itemBasics.js
//
// Патч 387: базовые характеристики предмета ОДНОЙ СТРОКОЙ — подстрока в
// модалке выбора предметов (лут, стартовая закупка/торговля; AddItemModal).
// Только данные каталога: у оружия урон/скорострельность/дальность, у брони —
// СУ по трём типам, у препаратов/еды/напитков — готовый локализованный эффект,
// у всего — вес и цена. Пустые значения не пишутся: строка честно короткая.
//
// Модуль чистый (словари-константы, локаль аргументом) — по образцу
// domain/weaponDisplay.js. RN-модули в vitest не парсятся (урок 383), поэтому
// логика живёт здесь, а модалка только вызывает.

import { getCurrentModuleLocale } from '../i18n/locale';
import { resolveAmmoName, weaponEffectsLabel, weaponQualitiesLabel } from './weaponDisplay';

const LABELS = {
  'ru-RU': {
    damage: 'Урон', fireRate: 'Скорострельность', range: 'Дальность',
    physical: 'Физ', energy: 'Энерг', radiation: 'Рад',
    weight: 'Вес', cost: 'Цена',
    ammo: 'Боеприпас', effects: 'Эффекты', qualities: 'Качества',
  },
  'en-EN': {
    damage: 'Damage', fireRate: 'Fire rate', range: 'Range',
    physical: 'Phys', energy: 'Energy', radiation: 'Rad',
    weight: 'Weight', cost: 'Cost',
    ammo: 'Ammo', effects: 'Effects', qualities: 'Qualities',
  },
};

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Число без хвостовых нулей: 4 → «4», 0.5 → «0.5», 0.04000 → «0.04». */
const fmt = (n) => String(Math.round(n * 10000) / 10000);

const push = (parts, label, value) => {
  if (value === null || value === undefined || value === '') return;
  const n = toNum(value);
  if (n !== null) {
    if (n === 0) return; // нули не шумят в строке
    parts.push(`${label} ${fmt(n)}`);
    return;
  }
  parts.push(`${label}: ${value}`);
};

/**
 * Строка базовых характеристик предмета каталога.
 *
 * @param {object} item — запись каталога (weapons/armor/ammo/chems/food/…)
 * @param {string} [locale] — по умолчанию текущая локаль сеттинга
 * @returns {string} «Урон 6 · Скорострельность 1 · Дальность: Близкая · Вес 4 · Цена 99»
 *                   или '' — если у предмета нечего показать.
 */
export function describeItemBasics(item, locale = getCurrentModuleLocale()) {
  if (!item || typeof item !== 'object') return '';
  const L = LABELS[locale] || LABELS['en-EN'];
  const parts = [];

  if (item.damage != null) push(parts, L.damage, item.damage);
  if (item.fireRate != null) push(parts, L.fireRate, item.fireRate);
  if (item.rangeName || item.range_name) {
    parts.push(`${L.range}: ${item.rangeName || item.range_name}`);
  }

  // 387 (слово владельца): у оружия ещё тип патронов, эффекты и качества.
  // ammoId бывает списком через запятую («ammo_energy_cell,ammo_fusion_core»);
  // ammo_anything («что угодно») в строку не пишем.
  if (item.ammoId) {
    const names = String(item.ammoId)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id && id !== 'ammo_anything')
      .map((id) => resolveAmmoName(id, locale));
    if (names.length) parts.push(`${L.ammo}: ${names.join(' / ')}`);
  }
  const effectsLine = weaponEffectsLabel(item.effects, locale);
  if (effectsLine) parts.push(`${L.effects}: ${effectsLine}`);
  const qualitiesLine = weaponQualitiesLabel(item.qualities, locale);
  if (qualitiesLine) parts.push(`${L.qualities}: ${qualitiesLine}`);

  // Броня/обшивка/силовая броня: СУ по трём типам (ноль у СУ показываем —
  // «нет защиты от радиации» это характеристика, а не пустота). У оружия в
  // данных тоже лежат *DamageRating (нули) — там их не показываем.
  const isArmorLike = Array.isArray(item.protectedAreas)
    || item.itemType === 'plating' || item.itemType === 'robotArmor'
    || item.itemType === 'powerArmor';
  if (isArmorLike) {
    const rating = (key, label) => {
      const v = toNum(item[key]);
      if (v !== null) parts.push(`${label} ${fmt(v)}`);
    };
    rating('physicalDamageRating', L.physical);
    rating('energyDamageRating', L.energy);
    rating('radiationDamageRating', L.radiation);
  }

  // Эффект — готовые локализованные метки каталога.
  for (const key of ['effectLabel', 'description', 'positiveEffectLabel', 'negativeEffectLabel']) {
    if (typeof item[key] === 'string' && item[key].trim()) {
      parts.push(item[key].trim());
      break;
    }
  }

  push(parts, L.weight, item.weight);
  push(parts, L.cost, item.cost);

  return parts.join(' · ');
}
