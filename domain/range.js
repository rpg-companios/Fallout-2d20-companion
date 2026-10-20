// Generic compatibility adapter for an active setting's ordinal range scale.
import { getSettingService } from './registry.js';

const getRangeService = () => getSettingService('inventory')?.range ?? null;

/** Forward an index clamp to the setting that declares its scale. */
export const clampRangeIndex = (index) => {
  const clamp = getRangeService()?.clampIndex;
  return typeof clamp === 'function' ? clamp(index) : Math.max(0, Number(index) || 0);
};

/** Resolve a setting-owned range representation to its ordinal, if declared. */
export const rangeToIndex = (value) => {
  const resolve = getRangeService()?.toIndex;
  return typeof resolve === 'function' ? resolve(value) : null;
};

/** Resolve an ordinal to the active setting's canonical range label. */
export const indexToRangeName = (index) => {
  const resolve = getRangeService()?.indexToName;
  return typeof resolve === 'function' ? resolve(index) : null;
};

/** Resolve an arbitrary representation directly to a canonical range label. */
export const rangeToName = (value) => {
  const resolve = getRangeService()?.toName;
  if (typeof resolve === 'function') return resolve(value);
  const index = rangeToIndex(value);
  return index == null ? null : indexToRangeName(index);
};

/** Shift a range through the active setting's ordinal scale. */
export const shiftRange = (value, steps = 0) => {
  const shift = getRangeService()?.shift;
  return typeof shift === 'function' ? shift(value, steps) : null;
};

/** Resolve range fields for a display item without assuming a range schema. */
export const resolveWeaponRangeFields = (weapon = {}) => {
  const resolve = getRangeService()?.resolveWeaponFields;
  return typeof resolve === 'function'
    ? resolve(weapon)
    : { range_index: undefined, range_name: undefined };
};
