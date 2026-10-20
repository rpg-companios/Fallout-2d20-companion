// Fallout catalog item sublines used by the shared add-item modal.
import { getCurrentModuleLocale } from '../../../i18n/locale.js';
import { resolveAmmoName, weaponEffectsLabel, weaponQualitiesLabel } from './weaponDisplay.js';
import { isFalloutArmorLikeItem } from './itemType.js';

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

const toNum = (value) => {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const formatNumber = (number) => String(Math.round(number * 10000) / 10000);

const push = (parts, label, value) => {
  if (value === null || value === undefined || value === '') return;
  const number = toNum(value);
  if (number !== null) {
    if (number === 0) return;
    parts.push(`${label} ${formatNumber(number)}`);
    return;
  }
  parts.push(`${label}: ${value}`);
};

export const describeFalloutItemBasics = (item, locale = getCurrentModuleLocale()) => {
  if (!item || typeof item !== 'object') return '';
  const labels = LABELS[locale] || LABELS['en-EN'];
  const parts = [];

  if (item.damage != null) push(parts, labels.damage, item.damage);
  if (item.fireRate != null) push(parts, labels.fireRate, item.fireRate);
  if (item.rangeName || item.range_name) {
    parts.push(`${labels.range}: ${item.rangeName || item.range_name}`);
  }

  if (item.ammoId) {
    const names = String(item.ammoId)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id && id !== 'ammo_anything')
      .map((id) => resolveAmmoName(id, locale));
    if (names.length) parts.push(`${labels.ammo}: ${names.join(' / ')}`);
  }
  const effectsLine = weaponEffectsLabel(item.effects, locale);
  if (effectsLine) parts.push(`${labels.effects}: ${effectsLine}`);
  const qualitiesLine = weaponQualitiesLabel(item.qualities, locale);
  if (qualitiesLine) parts.push(`${labels.qualities}: ${qualitiesLine}`);

  const isArmorLike = Array.isArray(item.protectedAreas) || isFalloutArmorLikeItem(item);
  if (isArmorLike) {
    const rating = (key, label) => {
      const value = toNum(item[key]);
      if (value !== null) parts.push(`${label} ${formatNumber(value)}`);
    };
    rating('physicalDamageRating', labels.physical);
    rating('energyDamageRating', labels.energy);
    rating('radiationDamageRating', labels.radiation);
  }

  for (const key of ['effectLabel', 'description', 'positiveEffectLabel', 'negativeEffectLabel']) {
    if (typeof item[key] === 'string' && item[key].trim()) {
      parts.push(item[key].trim());
      break;
    }
  }

  push(parts, labels.weight, item.weight);
  push(parts, labels.cost, item.cost);
  return parts.join(' · ');
};
