// Generic adapters for optional setting-owned equipment-modifier behavior.
import { getSettingService } from './registry.js';

const getArmorModifierCapability = () =>
  getSettingService('inventory')?.features?.armorMods ?? null;

export const getArmorCategoryConfig = (item, catalog) =>
  getArmorModifierCapability()?.getCategoryConfig?.(item, catalog) ?? null;

export const getAvailableArmorMods = (item, catalog) =>
  getArmorModifierCapability()?.getAvailableMods?.(item, catalog)
  ?? { standardMods: [], uniqueMods: [] };

export const filterModsByInventory = (mods, ownedIds) =>
  !ownedIds ? mods : (mods || []).filter((mod) => ownedIds.has(mod.id));

export const isUniqueModAllowedForArmor = (mod, item, catalog) =>
  Boolean(getArmorModifierCapability()?.isUniqueModAllowed?.(mod, item, catalog));

export const formatModBonuses = (mod, labels = {}) =>
  getArmorModifierCapability()?.formatBonuses?.(mod, labels)
  ?? { bonuses: '', effects: '' };

export const applyArmorModToItem = (armorItem, mod) =>
  getArmorModifierCapability()?.applyMod?.(armorItem, mod) ?? armorItem;

const EMPTY_EFFECTS = Object.freeze({ bonusEffects: [], rules: [] });

export const applyArmorMods = (armorItem, catalog, opts = {}) =>
  getArmorModifierCapability()?.applyMods?.(armorItem, catalog, opts)
  ?? { item: armorItem, effects: EMPTY_EFFECTS };

/** Generic delta used by any setting that installs or removes item modifiers. */
export const diffModInstallPlan = (prevIds, nextIds) => {
  const prev = Array.isArray(prevIds) ? prevIds : [];
  const next = Array.isArray(nextIds) ? nextIds : [];
  return {
    install: next.filter((id) => !prev.includes(id)),
    uninstall: prev.filter((id) => !next.includes(id)),
  };
};
