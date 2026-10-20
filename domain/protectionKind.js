// Generic optional protection classification supplied by the active setting.
import { getSettingService } from './registry.js';

export const PROTECTION_KINDS = Object.freeze({
  ARMOR: 'armor',
  CLOTHING: 'clothing',
});

export const resolveArmorCategoryKey = (item, catalog) => {
  const resolve = getSettingService('inventory')?.getArmorCategoryKey;
  return typeof resolve === 'function' ? (resolve(item, catalog) ?? null) : null;
};

export const getProtectionKind = (item) => {
  const classify = getSettingService('inventory')?.getProtectionKind;
  return typeof classify === 'function' ? (classify(item) ?? null) : null;
};
