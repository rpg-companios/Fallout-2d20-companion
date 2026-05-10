// domain/perks.js
// Utilities to evaluate perk requirements against current character state

import { getCanonicalAttributeKey } from './characterCreation';

// Mapping from perks.json S.P.E.C.I.A.L abbreviations to internal attribute names
const ATTRIBUTE_CODE_TO_NAME = {
    STR: 'STR',
    END: 'END',
    PER: 'PER',
    AGI: 'AGI',
    INT: 'INT',
    CHA: 'CHA',
    LCK: 'LCK',
};

/**
 * Build a quick lookup map for current attribute values by internal name
 */
export function buildAttributeValueMap(attributes) {
    const map = {};
    for (const attr of attributes || []) {
        const key = getCanonicalAttributeKey(attr.name);
        if (key) map[key] = attr.value;
    }
    return map;
}

/**
 * Returns true if the character meets a specific perk's requirements.
 * Currently considers attribute minimums and char_lvl only.
 */
export function meetsPerkRequirements(perk, attributes, level) {
    if (!perk) return false;
    const req = perk.requirements || {};

    // Level requirement
    const requiredLevel = req.char_lvl;
    if (typeof requiredLevel === 'number' && level < requiredLevel) {
        return false;
    }

    // Attribute requirements
    const attrReq = req.attributes || {};
    if (attrReq && Object.keys(attrReq).length > 0) {
        const valueByName = buildAttributeValueMap(attributes);
        for (const [code, minVal] of Object.entries(attrReq)) {
            const internalName = ATTRIBUTE_CODE_TO_NAME[code];
            if (!internalName) continue; // unknown code, ignore gracefully
            const currentVal = valueByName[internalName] ?? 0;
            if (currentVal < minVal) return false;
        }
    }

    // Other requirements (e.g., "не робот") are ignored for now per scope
    return true;
}

/**
 * Returns a structured status for why a perk is not available.
 */
export function getPerkUnmetReasons(perk, attributes, level) {
    const reasons = { level: false, attributes: {} };
    if (!perk) return reasons;
    const req = perk.requirements || {};

    // Level
    const requiredLevel = req.char_lvl;
    if (typeof requiredLevel === 'number' && level < requiredLevel) {
        reasons.level = { required: requiredLevel, current: level };
    }

    // Attributes
    const attrReq = req.attributes || {};
    const valueByName = buildAttributeValueMap(attributes);
    for (const [code, minVal] of Object.entries(attrReq)) {
        const internalName = ATTRIBUTE_CODE_TO_NAME[code];
        if (!internalName) continue;
        const currentVal = valueByName[internalName] ?? 0;
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
