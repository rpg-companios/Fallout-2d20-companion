// domain/modsEquip.js
// Weapon and armor modification logic.
// Pure functions — no React, no UI dependencies.

import { clampRangeIndex, indexToRangeName } from './range.js';
import { getProtectionKind, PROTECTION_KINDS, resolveArmorCategoryKey } from './protectionKind.js';

// ---------------------------------------------------------------------------
// WEAPON MODIFICATIONS
// ---------------------------------------------------------------------------

// Format armor mod bonuses into human-readable strings.
// Labels are passed in so callers can supply i18n-translated strings.
export const formatModBonuses = (mod, labels = {}) => {
    const improvementsLabel = labels.improvements || 'Improvements';
    const effectsLabel = labels.effects || 'Effects';
    const p = normalizeModifierValue(mod?.statModifiers?.physicalDamageRating);
    const e = normalizeModifierValue(mod?.statModifiers?.energyDamageRating);
    const r = normalizeModifierValue(mod?.statModifiers?.radiationDamageRating);
    const effectsText = (mod?.specialEffects || []).map((x) => x.description).filter(Boolean).join(' | ');
    return {
        bonuses: `${improvementsLabel}: ${p >= 0 ? '+' : ''}${p} Phys. DR; ${e >= 0 ? '+' : ''}${e} Energy DR; ${r >= 0 ? '+' : ''}${r} Rad. DR`,
        effects: effectsText ? `${effectsLabel}: ${effectsText}` : `${effectsLabel}: —`,
    };
};

// Apply a single armor mod's stat deltas to an armor item.
export const applyArmorModToItem = (armorItem, mod) => {
    if (!armorItem || !mod) return armorItem;
    const next = { ...armorItem };
    next.physicalDamageRating = Number(next.physicalDamageRating || 0) + normalizeModifierValue(mod.statModifiers?.physicalDamageRating);
    next.energyDamageRating = Number(next.energyDamageRating || 0) + normalizeModifierValue(mod.statModifiers?.energyDamageRating);
    next.radiationDamageRating = Number(next.radiationDamageRating || 0) + normalizeModifierValue(mod.statModifiers?.radiationDamageRating);
    next.weight = Number(next.weight || 0) + normalizeModifierValue(mod.weightModifier);
    next.cost = Number(next.cost || 0) + normalizeModifierValue(mod.costModifier);
    next.appliedArmorModsMeta = [...(next.appliedArmorModsMeta || []), mod];
    return next;
};

// Apply standard and unique armor mods from a catalog to an armor item.
const DEFAULT_EFFECTS = { bonusEffects: [], rules: [] };
export const getArmorCategoryConfig = (item, catalog) => {
    const categoryKey = resolveArmorCategoryKey(item);
    if (!categoryKey) return null;
    const raw = catalog?.armorRaw?.[categoryKey];
    if (!raw) return null;
    return raw;
};
export const applyArmorMods = (armorItem, catalog, opts = {}) => {
    if (!armorItem) return { item: armorItem, effects: DEFAULT_EFFECTS };

    // ПРАВИЛО (от владельца): не броня (одежда и прочее) — моды брони не действуют,
    // в т.ч. записанные ранее из-за старого бага. Вид решает getProtectionKind
    // (domain/protectionKind.js), а не слот предмета.
    if (getProtectionKind(armorItem) !== PROTECTION_KINDS.ARMOR) {
        return { item: armorItem, effects: DEFAULT_EFFECTS };
    }

    // ПРАВИЛО (от владельца, 2026-07-31): без явного семейства брони — никакие
    // моды не применяются (даже «универсальные» и даже уже записанные ранее).
    if (!getArmorCategoryConfig(armorItem, catalog)) {
        return { item: armorItem, effects: DEFAULT_EFFECTS };
    }

    const stdKey = opts.standardKey || 'appliedArmorModId';
    const uniqKey = opts.uniqueKey || 'appliedUniqueArmorModId';
    const stdModId = armorItem[stdKey] || armorItem.appliedArmorMod?.id;
    const uniqModId = armorItem[uniqKey] || armorItem.appliedUniqueArmorMod?.id;

    const allStd = Array.isArray(opts.standardMods) ? opts.standardMods : (Array.isArray(catalog?.armorMods) ? catalog.armorMods : []);
    const allUniq = Array.isArray(opts.uniqueMods) ? opts.uniqueMods : (Array.isArray(catalog?.uniqArmorMods) ? catalog.uniqArmorMods : []);
    const stdMod = stdModId ? allStd.find((m) => m.id === stdModId) : (armorItem.appliedArmorMod || null);
    let uniqMod = uniqModId ? allUniq.find((m) => m.id === uniqModId) : (armorItem.appliedUniqueArmorMod || null);

    // ПРАВИЛО (от владельца): уникальный мод чужой категории не применяется.
    // Защищает статистику предметов, сохранённых до введения строгой фильтрации.
    if (uniqMod && !isUniqueModAllowedForArmor(uniqMod, armorItem, catalog)) {
        uniqMod = null;
    }

    const used = [stdMod, uniqMod].filter(Boolean).slice(0, 2);
    let modified = { ...armorItem };
    used.forEach((m) => { modified = applyArmorModToItem(modified, m); });

    const bonusEffects = [];
    used.forEach((m) => {
        (m.specialEffects || []).forEach((effect) => {
            const baseRule = catalog?.armorEffects?.[effect.id];
            bonusEffects.push({ ...baseRule, ...effect, sourceModId: m.id });
        });
    });

    return { item: modified, effects: { bonusEffects, rules: bonusEffects } };
};
