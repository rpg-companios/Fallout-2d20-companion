// Generic adapters for optional setting-owned item presentation.
import { getSettingService } from './registry.js';

const getWeaponPresentation = () =>
  getSettingService('inventory')?.features?.weaponPresentation ?? null;

const call = (method, args, fallback = '') => {
  const fn = getWeaponPresentation()?.[method];
  return typeof fn === 'function' ? (fn(...args) ?? fallback) : fallback;
};

export const weaponQualitiesLabel = (qualities, locale) =>
  call('qualitiesLabel', [qualities, locale]);

export const weaponEffectsLabel = (effects, locale) =>
  call('effectsLabel', [effects, locale]);

export const resolveWeaponEffects = (effects) => call('resolveEffects', [effects]);
export const resolveWeaponQualities = (qualities) => call('resolveQualities', [qualities]);
export const resolveAmmoName = (ammoId, locale) => call('ammoName', [ammoId, locale]);
export const getWeaponAmmoNames = (item, catalog) => call('getAmmoNames', [item, catalog], []);
export const resolveWeaponDamageType = (damageType) => call('damageTypeLabel', [damageType]);

export const getWeaponDisplayPriority = (weapon) =>
  call('getPriority', [weapon], 4);

export const sortWeaponsForDisplay = (weapons = []) =>
  call('sortWeapons', [weapons], [...weapons]);

export const describeWeaponModChanges = (mod, locale) =>
  call('describeModifier', [mod, locale]);

export const weaponModRowDescription = (row) =>
  call('modifierRowDescription', [row]);
