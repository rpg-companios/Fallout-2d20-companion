import { getSettingData, getSettingNames } from '../../../domain/registry.js';
import { getCurrentModuleLocale } from '../../../i18n/locale.js';

const EMPTY_ARRAY = Object.freeze([]);

export const getFalloutUniqQualities = () => (
  getSettingData('equipment', 'uniqQualities') ?? EMPTY_ARRAY
);

export const getFalloutUniqQualityName = (id, locale = getCurrentModuleLocale()) => {
  if (!id) return '';
  const qualities = getSettingNames(locale)?.system?.uniqQualities ?? EMPTY_ARRAY;
  const entry = qualities.find((quality) => quality?.id === id);
  return entry?.name || '';
};

/** Compose a Fallout item name from localized unique-quality names and its base. */
export const composeFalloutNameWithQualities = (baseName, qualityIds = [], nameById = getFalloutUniqQualityName) => {
  const names = (qualityIds || []).map((id) => nameById(id)).filter(Boolean);
  return [...names, baseName].filter(Boolean).join(' ');
};
