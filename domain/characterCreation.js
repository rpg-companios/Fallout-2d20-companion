// domain/characterCreation.js
// Pure character creation logic: attributes, skills, derived stats.
// No React, no UI dependencies. No locale literals — skill identity is the
// canonical UPPER_SNAKE_CASE key from SKILL_CATALOG_ORDER below.

import { getOrigins, getTraits } from './registry';

// МК-3 (патч 316): универсальные параметровские хелперы переехали в
// src/store/resolvers.js — чистый дом без импортов, чтобы файлы логики модуля
// (modules/fallout/logic/*) могли их читать, не задевая реестр и этот файл.
// Здесь — re-export для совместимости со всеми прежними потребителями.
import {
  CANONICAL_ATTRIBUTE_KEYS,
  getCanonicalAttributeKey,
  getAttributeValue,
  getEquipmentCarryWeightModifier,
} from '../src/store/resolvers.js';

export {
  CANONICAL_ATTRIBUTE_KEYS,
  getCanonicalAttributeKey,
  getAttributeValue,
  getEquipmentCarryWeightModifier,
};

// ---------------------------------------------------------------------------

// normalizeAttributeMap: приведение словаря атрибутов к каноническим ключам.
export const normalizeAttributeMap = (attributeMap = {}) =>
    Object.entries(attributeMap).reduce((acc, [key, value]) => {
        const canonical = getCanonicalAttributeKey(key);
        if (canonical) {
            acc[canonical] = value;
        }
        return acc;
    }, {});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASE_ATTRIBUTE_VALUE = 4;
export const BASE_MIN_ATTRIBUTE = 4;
export const BASE_MAX_ATTRIBUTE = 10;
export const MIN_ATTRIBUTE = BASE_MIN_ATTRIBUTE;
export const MAX_ATTRIBUTE = BASE_MAX_ATTRIBUTE;
export const DISTRIBUTION_POINTS = 12;
export const BASE_TAGGED_SKILLS = 3;

// Skill keys in canonical order — order matches i18n/*/CharacterScreen.json skillsCatalog.
// Russian names (from ru-RU locale) are used as stable identifiers throughout the app
// (persisted to DB, used in traitsData forcedSkills, selectedSkills arrays, etc.).
// We derive them from the i18n source to avoid hardcoding.

const SKILL_CATALOG_ORDER = [
    'ATHLETICS',
    'BARTER',
    'BIG_GUNS',
    'ENERGY_WEAPONS',
    'EXPLOSIVES',
    'LOCKPICK',
    'MEDICINE',
    'MELEE_WEAPONS',
    'PILOT',
    'REPAIR',
    'SCIENCE',
    'SMALL_GUNS',
    'SNEAK',
    'SPEECH',
    'SURVIVAL',
    'THROWING',
    'UNARMED',
];

// ALL_SKILL_KEYS — canonical keys for use in new code
export const ALL_SKILL_KEYS = SKILL_CATALOG_ORDER;

// ALL_SKILLS — `name` is the canonical SKILL key (UPPER_SNAKE_CASE).
// For display, callers use getSkillDisplayName(name) / tCharacterScreen(`skillsCatalog.${name}`).
// Single source of truth for skill identity. No aliases, no localized literals.
export const ALL_SKILLS = SKILL_CATALOG_ORDER.map((key) => ({
    name: key,
    value: 0,
}));

// ---------------------------------------------------------------------------
// Attribute functions
// ---------------------------------------------------------------------------

export function createInitialAttributes() {
    return [
        { name: 'STR', value: 4 },
        { name: 'PER', value: 4 },
        { name: 'END', value: 4 },
        { name: 'CHA', value: 4 },
        { name: 'INT', value: 4 },
        { name: 'AGI', value: 4 },
        { name: 'LCK', value: 4 },
    ];
}

// Trait attribute modifiers come in two shapes in data:
//   1) number               → e.g. attributes.STR = 2        (flat bonus)
//   2) object               → e.g. attributes.STR = { baseBonus: 2, min: 6, max: 12 }
// These helpers read both shapes uniformly.

/** Numeric starting bonus a trait gives to an attribute (0 if none). */
export const getTraitAttributeBonus = (entry) => {
    if (entry == null) return 0;
    if (typeof entry === 'number') return entry;
    if (typeof entry === 'object') return Number(entry.baseBonus ?? entry.bonus ?? 0) || 0;
    return 0;
};

/** { min, max } a trait entry declares for an attribute, or {} if none. */
const getTraitAttributeMinMax = (entry) => {
    if (entry && typeof entry === 'object') {
        const out = {};
        if (entry.min != null) out.min = Number(entry.min);
        if (entry.max != null) out.max = Number(entry.max);
        return out;
    }
    return {};
};

export const getAttributeLimits = (trait, attrName) => {
    const normalizedName = getCanonicalAttributeKey(attrName);
    // Explicit per-trait limit maps (legacy shape).
    const minLimits = normalizeAttributeMap(trait?.modifiers?.minLimits);
    const maxLimits = normalizeAttributeMap(trait?.modifiers?.maxLimits);
    // Per-attribute object shape (e.g. supermutant: attributes.STR = {min, max}).
    const attrEntries = normalizeAttributeMap(trait?.modifiers?.attributes);
    const fromAttr = getTraitAttributeMinMax(attrEntries?.[normalizedName]);

    return {
        min: minLimits?.[normalizedName] ?? fromAttr.min ?? BASE_MIN_ATTRIBUTE,
        max: maxLimits?.[normalizedName] ?? fromAttr.max ?? BASE_MAX_ATTRIBUTE,
    };
};

export function getRemainingAttributePoints(attributes, trait) {
    const extraFromTrait = trait?.modifiers?.attributePointsBonus ?? 0;
    const totalPointsToDistribute = DISTRIBUTION_POINTS + extraFromTrait;

    const spentByUser = attributes.reduce((sum, attr) => {
        return sum + Math.max(0, attr.value - BASE_ATTRIBUTE_VALUE);
    }, 0);

    let bonusFromTrait = 0;
    if (trait?.modifiers?.attributes) {
        bonusFromTrait = Object.values(trait.modifiers.attributes).reduce(
            (sum, val) => {
                const bonus = getTraitAttributeBonus(val);
                return bonus > 0 ? sum + bonus : sum;
            },
            0,
        );
    }

    return totalPointsToDistribute - (spentByUser - bonusFromTrait);
}

export function canChangeAttribute(value, attrName, delta, trait) {
    const nextValue = value + delta;
    const { min, max } = getAttributeLimits(trait, attrName);
    return nextValue >= min && nextValue <= max;
}

export function getMaxSelectableSkills(trait) {
    return BASE_TAGGED_SKILLS;
}

// ---------------------------------------------------------------------------
// Skill functions
// ---------------------------------------------------------------------------

export function getSkillPoints(attributes, level = 1) {
    const intAttr = getAttributeValue(attributes, 'INT');
    return intAttr + 9 + (level > 1 ? level - 1 : 0);
}

export function calculateSkillPointsUsed(skills, selectedSkills, extraTaggedSkills = []) {
    let total = 0;
    for (const skill of skills) {
        const isTagged =
            selectedSkills.includes(skill.name) ||
            extraTaggedSkills.includes(skill.name);
        const baseValue = isTagged ? 2 : 0;
        total += Math.max(0, skill.value - baseValue);
    }
    return total;
}

export function canChangeSkillValue(currentValue, delta, trait, level, isTagged) {
    const nextValue = currentValue + delta;
    const minValue = isTagged ? 2 : 0;
    if (nextValue < minValue) return false;

    let maxRank = trait?.modifiers?.skillMaxValue ?? 6;
    maxRank = Math.min(maxRank, 6);
    if (level === 1) maxRank = Math.min(maxRank, 3);

    return nextValue <= maxRank;
}

export const validateSkills = (skills, trait) => {
    const maxRank = trait?.modifiers?.skillMaxValue ?? 6;
    return {
        isValid: skills.every((s) => s.value <= maxRank),
        maxRank,
    };
};

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

export function getLuckPoints(attributes, trait) {
    const luckAttr = getAttributeValue(attributes, 'LCK');
    const luckDelta = trait?.modifiers?.luckMaxDelta ?? 0;
    return Math.max(0, luckAttr + luckDelta);
}

// МК-3 (патч 316): формулы производных (инициатива, защита, бонус ближнего боя,
// макс. ОЗ, грузоподъёмность людей и роботов) переехали в сеттинг —
// modules/fallout/logic/derivedStats.js. Движку — через дверь: domain/registry.js →
// getDerivedStatsLogic(). Правила не менялись, тела функций перенесены как есть.

// ---------------------------------------------------------------------------
// Origin utilities
// ---------------------------------------------------------------------------

// ПРАВИЛО (владелец): никакого хардкода. Мульти-трейт ориджины определяются
// по данным: ориджин мульти-трейт, если его первый трейт помечен isMultiTrait.
export const MULTI_TRAIT_ORIGIN_IDS = getOrigins()
    .filter((origin) => {
        const trait = getTraits().find((t) => t.id === origin.traitIds?.[0]);
        return trait?.modifiers?.isMultiTrait === true;
    })
    .map((origin) => origin.id);

export const isMultiTraitOrigin = (originId) => {
    return MULTI_TRAIT_ORIGIN_IDS.includes(originId);
};

/**
 * Персонаж «зафиксирован»: атрибуты или навыки уже распределены — смена
 * ориджина/трейта/комплекта требует полного сброса.
 */
export const isCharacterLocked = (attributesSaved, skillsSaved) =>
  Boolean(attributesSaved || skillsSaved);
