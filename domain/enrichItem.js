// Generic adapters for optional setting-owned item-modifier behavior.
import { getSettingService } from './registry.js';
import { applyNumericModifier } from './numericModifier.js';

const getItemModifierCapability = () =>
  getSettingService('inventory')?.features?.itemModifiers ?? null;

export const applyNumberModifier = (baseValue, modifier, options = {}) => {
  if (!modifier) return baseValue;
  return applyNumericModifier(baseValue, modifier, {
    allowSet: true,
    min: options.min ?? 0,
    clampMin: options.clampMin ?? modifier.op === '-',
    ...options,
  });
};

/** Compatibility adapter; modifier semantics remain owned by the active setting. */
export const applyWeaponMods = (baseItem, modifiers = []) =>
  getItemModifierCapability()?.applyWeapon?.(baseItem, modifiers) ?? baseItem;

/** Compatibility adapter; returns the setting-enriched item when supported. */
export const enrichWeaponItem = (item, catalog, options = {}) =>
  getItemModifierCapability()?.enrichWeapon?.(item, catalog, options) ?? item;

/** Shared neutral display-name composition. */
export const getItemDisplayName = ({ baseName = '', modPrefixes = [], qualityNames = [] } = {}) =>
  [...modPrefixes, ...qualityNames, baseName].filter(Boolean).join(' ');
