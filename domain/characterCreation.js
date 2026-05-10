// domain/characterCreation.js
// Pure character creation logic: attributes, skills, derived stats.
// No React, no UI dependencies. Imports only static i18n JSON for skill name catalog.

import ruCharacterScreen from '../i18n/ru-RU/screens/character/screen.json';

// ---------------------------------------------------------------------------
// Attribute key utilities (from attributeKeyUtils.js)
// ---------------------------------------------------------------------------

export const CANONICAL_ATTRIBUTE_KEYS = ['STR', 'END', 'PER', 'AGI', 'INT', 'CHA', 'LCK'];

const ATTRIBUTE_KEY_ALIASES = {
    STR: 'STR',
    END: 'END',
    PER: 'PER',
    AGI: 'AGI',
    INT: 'INT',
    CHA: 'CHA',
    LCK: 'LCK',
};

export const getCanonicalAttributeKey = (key) => ATTRIBUTE_KEY_ALIASES[key] || null;

export const normalizeAttributeMap = (attributeMap = {}) =>
    Object.entries(attributeMap).reduce((acc, [key, value]) => {
        const canonical = getCanonicalAttributeKey(key);
        if (canonical) {
            acc[canonical] = value;
        }
        return acc;
    }, {});

export const getAttributeValue = (attributes = [], key) => {
    const canonical = getCanonicalAttributeKey(key);
    if (!canonical) return null;
    const found = attributes.find(
        (attr) => getCanonicalAttributeKey(attr.name) === canonical,
    );
    return found?.value ?? 0;
};

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

// ALL_SKILLS — uses Russian display names as identifiers (legacy stable IDs)
const _skillsCatalog = ruCharacterScreen.skillsCatalog || {};
export const ALL_SKILLS = SKILL_CATALOG_ORDER.map((key) => ({
    name: _skillsCatalog[key] || key,
    value: 0,
}));

// ---------------------------------------------------------------------------
// Attribute functions
// ---------------------------------------------------------------------------

export function createInitialAttributes() {
    return [
        { name: 'STR', value: 4 },
        { name: 'END', value: 4 },
        { name: 'PER', value: 4 },
        { name: 'AGI', value: 4 },
        { name: 'INT', value: 4 },
        { name: 'CHA', value: 4 },
        { name: 'LCK', value: 4 },
    ];
}

export const getAttributeLimits = (trait, attrName) => {
    const normalizedName = getCanonicalAttributeKey(attrName);
    const minLimits = normalizeAttributeMap(trait?.modifiers?.minLimits);
    const maxLimits = normalizeAttributeMap(trait?.modifiers?.maxLimits);
    return {
        min: minLimits?.[normalizedName] ?? BASE_MIN_ATTRIBUTE,
        max: maxLimits?.[normalizedName] ?? BASE_MAX_ATTRIBUTE,
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
            (sum, val) => (val > 0 ? sum + val : sum),
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

export const calculateInitiative = (attributes) => {
    const perception = getAttributeValue(attributes, 'PER');
    const agility = getAttributeValue(attributes, 'AGI');
    return perception + agility;
};

export const calculateDefense = (attributes) => {
    const agility = getAttributeValue(attributes, 'AGI');
    return agility >= 9 ? 2 : 1;
};

export const calculateMeleeBonus = (attributes, trait) => {
    const strength = getAttributeValue(attributes, 'STR');
    let baseBonus = 0;
    if (strength >= 11) baseBonus = 3;
    else if (strength >= 9) baseBonus = 2;
    else if (strength >= 7) baseBonus = 1;

    const traitBonus = trait?.modifiers?.meleeBonusDelta || 0;
    const totalBonus = baseBonus + traitBonus;
    return totalBonus > 0 ? `+${totalBonus} {CD}` : '0';
};

export const calculateMaxHealth = (attributes, level = 1) => {
    const endurance = getAttributeValue(attributes, 'END');
    const luck = getAttributeValue(attributes, 'LCK');
    return endurance + luck + (level > 1 ? level - 1 : 0);
};

export const calculateCarryWeight = (attributes, trait) => {
    const strength = getAttributeValue(attributes, 'STR');
    const baseCarryWeight = 150;
    const strengthMultiplier = trait?.modifiers?.carryWeightStrengthMultiplier ?? 10;
    const strengthBonus = strengthMultiplier * strength;
    const traitCarryWeightModifier = trait?.modifiers?.carryWeight || 0;
    return baseCarryWeight + strengthBonus + traitCarryWeightModifier;
};

// ---------------------------------------------------------------------------
// Origin utilities
// ---------------------------------------------------------------------------

// originId corresponds to the `id` field on origin objects (e.g. 'ncr', 'survivor', 'savage')
export const MULTI_TRAIT_ORIGIN_IDS = ['ncr', 'survivor', 'savage'];

export const isMultiTraitOrigin = (originId) => {
    return MULTI_TRAIT_ORIGIN_IDS.includes(originId);
};
