// domain/perks.js
// Utilities to evaluate perk requirements and aggregate perk effects.

import { getCanonicalAttributeKey } from './characterCreation';
import { getPerkEffect } from './perks/index';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const getPath = (source, path) => {
    if (!source || !path) return undefined;
    return String(path).split('.').reduce((current, key) => {
        if (current == null) return undefined;
        return current[key];
    }, source);
};

const toSelectedPerkId = (selected) => {
    if (!selected) return null;
    if (typeof selected === 'string') return selected;
    return selected.id || selected.perkId || null;
};

const toSelectedPerkRank = (selected) => {
    if (!selected || typeof selected === 'string') return 1;
    return Number(selected.rank || selected.ranks || selected.count || 1) || 1;
};

/**
 * Build a quick lookup map for current attribute values by canonical SPECIAL code.
 */
export function buildAttributeValueMap(attributes) {
    if (isObject(attributes)) {
        return Object.entries(attributes).reduce((acc, [key, attr]) => {
            const canonical = getCanonicalAttributeKey(attr?.id || key) || key;
            acc[canonical] = attr?.total ?? attr?.value ?? attr?.base ?? 0;
            return acc;
        }, {});
    }

    const map = {};
    for (const attr of attributes || []) {
        const key = getCanonicalAttributeKey(attr.name);
        if (key) map[key] = attr.value;
    }
    return map;
}

const getPrerequisites = (perk) => perk?.requirements || perk?.prerequisites || {};
const getLevelRequirement = (req) => req.char_lvl ?? req.level;
const getAttributeRequirements = (req) => req.attributes || req.special || {};

/**
 * Returns true if the character meets a specific perk's requirements.
 * Considers level and SPECIAL minimums. SPECIAL keys from perks.json are used directly.
 */
export function meetsPerkRequirements(perk, attributes, level) {
    if (!perk) return false;
    const req = getPrerequisites(perk);

    const requiredLevel = getLevelRequirement(req);
    if (typeof requiredLevel === 'number' && level < requiredLevel) {
        return false;
    }

    const attrReq = getAttributeRequirements(req);
    if (attrReq && Object.keys(attrReq).length > 0) {
        const valueByName = buildAttributeValueMap(attributes);
        for (const [code, minVal] of Object.entries(attrReq)) {
            const currentVal = valueByName[code] ?? 0;
            if (currentVal < minVal) return false;
        }
    }

    // Other requirements (e.g., "notForRobots") are ignored for now per scope.
    return true;
}

/**
 * Returns a structured status for why a perk is not available.
 */
export function getPerkUnmetReasons(perk, attributes, level) {
    const reasons = { level: false, attributes: {} };
    if (!perk) return reasons;
    const req = getPrerequisites(perk);

    const requiredLevel = getLevelRequirement(req);
    if (typeof requiredLevel === 'number' && level < requiredLevel) {
        reasons.level = { required: requiredLevel, current: level };
    }

    const attrReq = getAttributeRequirements(req);
    const valueByName = buildAttributeValueMap(attributes);
    for (const [code, minVal] of Object.entries(attrReq)) {
        const currentVal = valueByName[code] ?? 0;
        if (currentVal < minVal) {
            reasons.attributes[code] = { required: minVal, current: currentVal };
        }
    }

    return reasons;
}

/**
 * Helper to annotate a list of perks with availability status.
 */
export function annotatePerks(perks, attributes, level) {
    return (perks || []).map((perk) => {
        const available = meetsPerkRequirements(perk, attributes, level);
        const unmet = available ? null : getPerkUnmetReasons(perk, attributes, level);
        return { perk, available, unmet };
    });
}

export function createPerkEffectContext(state = {}, accumulated = {}) {
    return {
        state,
        bonuses: accumulated,
        resolve(path, fallback = undefined) {
            const fromBonuses = getPath(accumulated, path);
            if (fromBonuses !== undefined) return fromBonuses;
            const fromState = getPath(state, path);
            return fromState !== undefined ? fromState : fallback;
        },
    };
}

export function mergePerkBonuses(base = {}, addition = {}) {
    const result = { ...base };
    for (const [key, value] of Object.entries(addition || {})) {
        if (typeof value === 'number') {
            result[key] = (Number(result[key]) || 0) + value;
        } else if (Array.isArray(value)) {
            result[key] = [...(Array.isArray(result[key]) ? result[key] : []), ...value];
        } else if (isObject(value) && isObject(result[key])) {
            result[key] = mergePerkBonuses(result[key], value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function calculatePerkEffects(perks = [], selectedPerks = [], state = {}) {
    const byId = new Map((perks || []).map((perk) => [perk.id, perk]));
    let bonuses = {};
    const applied = [];

    for (const selected of selectedPerks || []) {
        const id = toSelectedPerkId(selected);
        if (!id) continue;
        const perk = byId.get(id) || (isObject(selected) ? selected : null);
        const effectId = perk?.effect || perk?.effectId || id;
        const effect = getPerkEffect(effectId);
        if (!effect?.apply) continue;

        const rank = toSelectedPerkRank(selected);
        const ctx = createPerkEffectContext({ ...state, perk, rank }, bonuses);
        const effectBonuses = effect.apply(ctx) || {};
        bonuses = mergePerkBonuses(bonuses, effectBonuses);
        applied.push({ perkId: id, effectId, rank, bonuses: effectBonuses });
    }

    return { bonuses, applied };
}

export function selectPerkBonuses(state, perks = []) {
    return calculatePerkEffects(perks, state?.selectedPerks || [], state).bonuses;
}
