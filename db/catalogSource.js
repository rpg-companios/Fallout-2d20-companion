// Generic adapter for the active setting's legacy catalog-query capability.
import { getActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime.js';

const getCatalogRowsCapability = () => {
  const runtime = getActiveSettingRuntime();
  return runtime?.services?.catalogs?.equipment?.databaseRows
    ?? runtime?.setting?.catalogs?.equipment?.databaseRows
    ?? null;
};

const invoke = (method, fallback, args) => {
  const action = getCatalogRowsCapability()?.[method];
  return typeof action === 'function' ? action(...args) : fallback();
};

export const catalogGetWeapons = (...args) => invoke('catalogGetWeapons', () => [], args);
export const catalogGetWeaponById = (...args) => invoke('catalogGetWeaponById', () => null, args);
export const catalogSearchWeapons = (...args) => invoke('catalogSearchWeapons', () => [], args);
export const catalogGetWeaponByName = (...args) => invoke('catalogGetWeaponByName', () => null, args);
export const catalogGetWeaponMods = (...args) => invoke('catalogGetWeaponMods', () => [], args);
export const catalogGetWeaponModById = (...args) => invoke('catalogGetWeaponModById', () => null, args);
export const catalogGetModsForWeaponSlot = (...args) => invoke('catalogGetModsForWeaponSlot', () => [], args);
export const catalogGetSlotsForWeapon = (...args) => invoke('catalogGetSlotsForWeapon', () => [], args);
export const catalogGetAmmoTypes = (...args) => invoke('catalogGetAmmoTypes', () => [], args);
export const catalogGetAmmoById = (...args) => invoke('catalogGetAmmoById', () => null, args);
export const catalogGetWeaponQualities = (...args) => invoke('catalogGetWeaponQualities', () => [], args);
export const catalogGetQualityByName = (...args) => invoke('catalogGetQualityByName', () => null, args);
export const catalogGetPerks = (...args) => invoke('catalogGetPerks', () => [], args);
export const catalogGetItems = (...args) => invoke('catalogGetItems', () => [], args);
export const catalogGetItemByName = (...args) => invoke('catalogGetItemByName', () => null, args);
export const catalogRowCount = (...args) => invoke('catalogRowCount', () => 0, args);
