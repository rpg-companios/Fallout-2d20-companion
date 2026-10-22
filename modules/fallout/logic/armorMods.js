// Fallout armor-mod eligibility, presentation, and derived protection statistics.
import { getProtectionKind, PROTECTION_KINDS, resolveArmorCategoryKey } from 'engine:domain/protectionKind';
import { applyNumericModifier } from 'engine:domain/numericModifier';

const hasIntersection = (a = [], b = []) => a.some((value) => b.includes(value));

export const getFalloutArmorCategoryConfig = (item, catalog) => {
  const categoryKey = resolveArmorCategoryKey(item, catalog);
  if (!categoryKey) return null;
  return catalog?.armorRaw?.[categoryKey] ?? null;
};

export const getAvailableFalloutArmorMods = (item, catalog) => {
  if (!item || getProtectionKind(item) !== PROTECTION_KINDS.ARMOR) {
    return { standardMods: [], uniqueMods: [] };
  }

  const categoryConfig = getFalloutArmorCategoryConfig(item, catalog);
  if (!categoryConfig) return { standardMods: [], uniqueMods: [] };

  const protectedAreas = Array.isArray(item.protectedAreas) ? item.protectedAreas : [];
  const allowedStandardCategories = new Set(categoryConfig.allowedModCategories || []);
  const allowedUniqueCategories = new Set(categoryConfig.allowedUniqueModCategories || []);

  const standardMods = (catalog?.armorMods || []).filter((mod) =>
    allowedStandardCategories.has(mod.modCategory)
    && hasIntersection(mod.protectedAreas || [], protectedAreas));
  const uniqueMods = (catalog?.uniqArmorMods || []).filter((mod) =>
    allowedUniqueCategories.has(mod.modCategory)
    && hasIntersection(mod.protectedAreas || [], protectedAreas));

  return { standardMods, uniqueMods };
};

export const filterFalloutModsByInventory = (mods, ownedIds) =>
  !ownedIds ? (mods || []) : (mods || []).filter((mod) => ownedIds.has(mod.id));

export const isFalloutUniqueModAllowedForArmor = (mod, item, catalog) => {
  if (!mod) return false;
  const categoryConfig = getFalloutArmorCategoryConfig(item, catalog);
  const allowedUniqueCategories = new Set(categoryConfig?.allowedUniqueModCategories || []);
  return allowedUniqueCategories.has(mod.modCategory);
};

const formatModifierValue = (modifier) => {
  if (!modifier) return '+0';
  const value = Number(modifier.value || 0);
  if (modifier.op === '+') return `+${value}`;
  if (modifier.op === '-') return `-${value}`;
  if (modifier.op === '*') return `×${value}`;
  if (modifier.op === '/') return `÷${value}`;
  return String(value);
};

export const formatFalloutArmorModBonuses = (mod, labels = {}) => {
  const improvementsLabel = labels.improvements || 'Improvements';
  const effectsLabel = labels.effects || 'Effects';
  const physical = formatModifierValue(mod?.statModifiers?.physicalDamageRating);
  const energy = formatModifierValue(mod?.statModifiers?.energyDamageRating);
  const radiation = formatModifierValue(mod?.statModifiers?.radiationDamageRating);
  const effectsText = (mod?.specialEffects || []).map((effect) => effect.description).filter(Boolean).join(' | ');
  return {
    bonuses: `${improvementsLabel}: ${physical} Phys. DR; ${energy} Energy DR; ${radiation} Rad. DR`,
    effects: effectsText ? `${effectsLabel}: ${effectsText}` : `${effectsLabel}: —`,
  };
};

export const applyFalloutArmorModToItem = (armorItem, mod) => {
  if (!armorItem || !mod) return armorItem;
  const next = { ...armorItem };
  const apply = (field, modifier, integer = true) => {
    if (!modifier) return Number(next[field] || 0);
    return applyNumericModifier(next[field] || 0, modifier, {
      field,
      integer,
      min: 0,
      clampMin: modifier.op === '-',
    });
  };
  next.physicalDamageRating = apply('physicalDamageRating', mod.statModifiers?.physicalDamageRating);
  next.energyDamageRating = apply('energyDamageRating', mod.statModifiers?.energyDamageRating);
  next.radiationDamageRating = apply('radiationDamageRating', mod.statModifiers?.radiationDamageRating);
  next.weight = apply('weight', mod.weightModifier, false);
  next.cost = apply('cost', mod.costModifier, true);
  next.appliedArmorModsMeta = [...(next.appliedArmorModsMeta || []), mod];
  return next;
};

const DEFAULT_EFFECTS = { bonusEffects: [], rules: [] };

export const applyFalloutArmorMods = (armorItem, catalog, opts = {}) => {
  if (!armorItem) return { item: armorItem, effects: DEFAULT_EFFECTS };
  if (getProtectionKind(armorItem) !== PROTECTION_KINDS.ARMOR) {
    return { item: armorItem, effects: DEFAULT_EFFECTS };
  }
  if (!getFalloutArmorCategoryConfig(armorItem, catalog)) {
    return { item: armorItem, effects: DEFAULT_EFFECTS };
  }

  const standardKey = opts.standardKey || 'appliedArmorModId';
  const uniqueKey = opts.uniqueKey || 'appliedUniqueArmorModId';
  const standardModId = armorItem[standardKey] || armorItem.appliedArmorMod?.id;
  const uniqueModId = armorItem[uniqueKey] || armorItem.appliedUniqueArmorMod?.id;
  const allStandardMods = Array.isArray(opts.standardMods)
    ? opts.standardMods
    : (Array.isArray(catalog?.armorMods) ? catalog.armorMods : []);
  const allUniqueMods = Array.isArray(opts.uniqueMods)
    ? opts.uniqueMods
    : (Array.isArray(catalog?.uniqArmorMods) ? catalog.uniqArmorMods : []);
  const standardMod = standardModId
    ? allStandardMods.find((mod) => mod.id === standardModId)
    : (armorItem.appliedArmorMod || null);
  let uniqueMod = uniqueModId
    ? allUniqueMods.find((mod) => mod.id === uniqueModId)
    : (armorItem.appliedUniqueArmorMod || null);

  if (uniqueMod && !isFalloutUniqueModAllowedForArmor(uniqueMod, armorItem, catalog)) uniqueMod = null;

  const used = [standardMod, uniqueMod].filter(Boolean).slice(0, 2);
  let modified = { ...armorItem };
  used.forEach((mod) => { modified = applyFalloutArmorModToItem(modified, mod); });

  const bonusEffects = [];
  used.forEach((mod) => {
    (mod.specialEffects || []).forEach((effect) => {
      const baseRule = catalog?.armorEffects?.[effect.id];
      bonusEffects.push({ ...baseRule, ...effect, sourceModId: mod.id });
    });
  });

  return { item: modified, effects: { bonusEffects, rules: bonusEffects } };
};

export const resolveFalloutModifiedItem = (item, catalog) => {
  if (!item) return null;
  const itemType = item.itemType;
  if (itemType === 'armor') return applyFalloutArmorMods(item, catalog).item;
  if (itemType === 'clothing' || itemType === 'outfit') {
    return applyFalloutArmorMods(item, catalog, {
      standardKey: 'appliedClothingModId',
      uniqueKey: 'unusedUniqueArmorModId',
    }).item;
  }
  return null;
};
