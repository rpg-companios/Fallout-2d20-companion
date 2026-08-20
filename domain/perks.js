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

export function getPerkMaxRanks(perk) {
    const maxRanks = Number(perk?.maxRanks ?? perk?.maxRank ?? 1);
    return Number.isFinite(maxRanks) && maxRanks > 0 ? maxRanks : 1;
}

export function getPerkSelectionCount(selectedPerks = [], perkId, { ignoreIndex } = {}) {
    if (!perkId) return 0;
    let count = 0;
    (selectedPerks || []).forEach((selected, index) => {
        if (ignoreIndex != null && index === ignoreIndex) return;
        if (toSelectedPerkId(selected) === perkId) count += 1;
    });
    return count;
}

export function getRequiredLevelForRank(perk, rank) {
    const req = getPrerequisites(perk);
    const baseLevel = getLevelRequirement(req);
    const increase = Number(req.levelIncreasePerRank) || 0;
    const base = typeof baseLevel === 'number' ? baseLevel : 1;
    return base + (Math.max(1, Number(rank) || 1) - 1) * increase;
}

export function canSelectPerk(perk, selectedPerks = [], { replaceIndex } = {}) {
    if (!perk?.id) return false;
    return getPerkSelectionCount(selectedPerks, perk.id, { ignoreIndex: replaceIndex }) < getPerkMaxRanks(perk);
}

export function withAssignedPerkRanks(selectedPerks = []) {
    const counts = {};
    return (selectedPerks || []).map((selected) => {
        const id = toSelectedPerkId(selected);
        if (!id) return selected;
        counts[id] = (counts[id] || 0) + 1;
        return { id, rank: counts[id] };
    });
}

export function applyPerkSelection(selectedPerks = [], perk, { replaceIndex } = {}) {
    if (!perk?.id) return { ok: false, reason: 'missing-perk', selectedPerks };
    if (!canSelectPerk(perk, selectedPerks, { replaceIndex })) {
        return { ok: false, reason: 'max-rank', selectedPerks };
    }

    const pick = { id: perk.id };
    const next = replaceIndex != null
        ? (selectedPerks || []).map((entry, index) => (index === replaceIndex ? pick : entry))
        : [...(selectedPerks || []), pick];

    return { ok: true, reason: null, selectedPerks: withAssignedPerkRanks(next) };
}

export function removeSelectedPerkAt(selectedPerks = [], index) {
    if (index == null || index < 0 || index >= (selectedPerks || []).length) {
        return selectedPerks || [];
    }
    return withAssignedPerkRanks((selectedPerks || []).filter((_, entryIndex) => entryIndex !== index));
}

const resolveCatalogMaxRanks = (selected, catalogById) => {
    const id = toSelectedPerkId(selected);
    const catalogPerk = id ? catalogById.get(id) : null;
    const rawMax = catalogPerk?.maxRanks;
    if (typeof rawMax !== 'number' || !Number.isFinite(rawMax) || rawMax < 1) return null;
    return rawMax;
};

/**
 * Keep at most catalog maxRanks picks of each perk. Extra picks are dropped
 * so the freed slots can be spent on other perks. maxRanks is read only from
 * the setting catalog — never from the saved perk record.
 */
export function trimSelectedPerksToMaxRanks(selectedPerks = [], perkCatalog = []) {
    const catalogById = new Map((perkCatalog || []).filter((perk) => perk?.id).map((perk) => [perk.id, perk]));
    const keptCounts = {};
    const kept = [];
    const removed = [];

    for (const selected of selectedPerks || []) {
        const id = toSelectedPerkId(selected);
        const maxRanks = resolveCatalogMaxRanks(selected, catalogById);
        if (!id || maxRanks == null) {
            kept.push(selected);
            continue;
        }
        keptCounts[id] = keptCounts[id] || 0;
        if (keptCounts[id] >= maxRanks) {
            removed.push(selected);
            continue;
        }
        keptCounts[id] += 1;
        kept.push(selected);
    }

    return {
        selectedPerks: withAssignedPerkRanks(kept),
        removed,
    };
}

export function identifySelectedPerk(selected, index) {
    if (typeof selected === 'string' && selected) return selected;
    return toSelectedPerkId(selected)
        || selected?.perk_name
        || selected?.name
        || selected?.nameKey
        || `#${index + 1}`;
}

export function inspectSelectedPerkRecords(selectedPerks = [], perkCatalog = []) {
    const catalogIds = new Set((perkCatalog || []).map((perk) => perk?.id).filter(Boolean));
    const missingId = [];
    const unknownId = [];

    (selectedPerks || []).forEach((selected, index) => {
        const id = toSelectedPerkId(selected);
        if (!id) {
            missingId.push({ selected, label: identifySelectedPerk(selected, index) });
            return;
        }
        if (!catalogIds.has(id)) {
            unknownId.push({ selected, label: identifySelectedPerk(selected, index) });
        }
    });

    return { missingId, unknownId };
}

/**
 * Collapse duplicate picks of the same perk into one entry whose rank is the
 * number of picks (or the stored rank when there is only one entry).
 * Needed so rank-scaled effects are not applied once per pick.
 */
export function collapseSelectedPerks(selectedPerks = []) {
    const groups = new Map();
    for (const selected of selectedPerks || []) {
        const id = toSelectedPerkId(selected);
        if (!id) continue;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(selected);
    }

    return [...groups.values()].map((entries) => {
        const first = entries[0];
        const rank = entries.length > 1
            ? entries.length
            : Math.max(toSelectedPerkRank(first), entries.length);
        if (typeof first === 'string') return { id: first, rank };
        return { ...first, rank };
    });
}

/**
 * Returns true if the character meets a specific perk's requirements.
 * Considers level, SPECIAL minimums, already-taken ranks, and exclusive perks.
 */
export function meetsPerkRequirements(perk, attributes, level, selectedPerks = [], options = {}) {
    if (!perk) return false;
    const unmet = getPerkUnmetReasons(perk, attributes, level, selectedPerks, options);
    return !unmet.level
        && Object.keys(unmet.attributes || {}).length === 0
        && !unmet.maxRank
        && !unmet.excluded;
}

/**
 * Returns a structured status for why a perk is not available.
 */
export function getPerkUnmetReasons(perk, attributes, level, selectedPerks = [], options = {}) {
    const reasons = { level: false, attributes: {} };
    if (!perk) return reasons;
    const req = getPrerequisites(perk);
    const ignoreIndex = options.replaceIndex;
    const currentRanks = getPerkSelectionCount(selectedPerks, perk.id, { ignoreIndex });
    const maxRanks = getPerkMaxRanks(perk);

    if (currentRanks >= maxRanks) {
        reasons.maxRank = { current: currentRanks, max: maxRanks };
    } else {
        const requiredLevel = getRequiredLevelForRank(perk, currentRanks + 1);
        if (typeof requiredLevel === 'number' && level < requiredLevel) {
            reasons.level = { required: requiredLevel, current: level };
        }
    }

    const excluded = req.excludedPerks || [];
    if (excluded.length > 0) {
        const blockedBy = [];
        (selectedPerks || []).forEach((selected, index) => {
            if (ignoreIndex != null && index === ignoreIndex) return;
            const id = toSelectedPerkId(selected);
            if (id && excluded.includes(id)) blockedBy.push(id);
        });
        if (blockedBy.length > 0) {
            reasons.excluded = { perkIds: blockedBy };
        }
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
export function annotatePerks(perks, attributes, level, selectedPerks = [], options = {}) {
    return (perks || []).map((perk) => {
        const available = meetsPerkRequirements(perk, attributes, level, selectedPerks, options);
        const unmet = available ? null : getPerkUnmetReasons(perk, attributes, level, selectedPerks, options);
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

    for (const selected of collapseSelectedPerks(selectedPerks)) {
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
