// Fallout catalog inheritance and variant modifier rules.
import { deepMerge } from 'engine:domain/deepMerge';
import { applyNumericModifier } from 'engine:domain/numericModifier';
import { clampRangeIndex, indexToRangeName, rangeToIndex } from './weaponRange.js';

const VARIANT_NUMERIC_FIELDS = Object.freeze([
  'damage',
  'fireRate',
  'weight',
  'cost',
  'rarity',
  'ammoPerShot',
  'physicalDamageRating',
  'energyDamageRating',
  'radiationDamageRating',
]);
const INTEGER_VARIANT_FIELDS = new Set([
  'damage',
  'fireRate',
  'cost',
  'rarity',
  'ammoPerShot',
  'physicalDamageRating',
  'energyDamageRating',
  'radiationDamageRating',
]);

const applyVariantIdChanges = (entries = [], changes = [], idKey) => {
  const byId = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const id = typeof entry === 'string' ? entry : entry?.[idKey] ?? entry?.id;
    if (id && id !== '–') byId.set(id, typeof entry === 'string' ? { [idKey]: id } : { ...entry });
  });

  for (const change of Array.isArray(changes) ? changes : []) {
    const id = change?.[idKey] ?? change?.id;
    if (!id) continue;
    if (change.op === 'lose') {
      byId.delete(id);
      continue;
    }
    const previous = byId.get(id);
    if (idKey === 'qualityId' && (previous?.value != null || change.value != null)) {
      byId.set(id, { qualityId: id, value: Number(previous?.value || 0) + Number(change.value || 0) });
    } else {
      byId.set(id, { ...(previous || {}), [idKey]: id, ...(change.value != null ? { value: change.value } : {}) });
    }
  }
  return [...byId.values()];
};

export const applyFalloutVariantModifiers = (entry, modifiers = {}) => {
  if (!entry || !modifiers || typeof modifiers !== 'object' || Array.isArray(modifiers)) return entry;
  let out = entry;
  for (const [key, value] of Object.entries(modifiers)) {
    if (key === 'replaceOriginalNameTo' || key === 'qualityChanges' || key === 'effectChanges') continue;
    if (key === 'rangeModifier') {
      const baseIndex = rangeToIndex(out.range_index ?? out.range_name ?? out.rangeName ?? out.range) ?? 0;
      const shifted = applyNumericModifier(baseIndex, value, {
        field: 'range',
        integer: true,
        min: 0,
        clampMin: true,
      });
      const index = clampRangeIndex(shifted);
      const name = indexToRangeName(index);
      out = { ...out, range_index: index, range_name: name, rangeName: name, range: name[0] };
      continue;
    }
    const field = key.endsWith('Modifier') ? key.slice(0, -'Modifier'.length) : null;
    if (!field || !VARIANT_NUMERIC_FIELDS.includes(field)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
      const result = applyNumericModifier(out[field], value, {
        field,
        integer: INTEGER_VARIANT_FIELDS.has(field),
        min: 0,
      });
      out = { ...out, [field]: result };
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out = { ...out, [field]: value };
    }
  }

  if (Array.isArray(modifiers.qualityChanges)) {
    out = { ...out, qualities: applyVariantIdChanges(out.qualities, modifiers.qualityChanges, 'qualityId') };
  }
  if (Array.isArray(modifiers.effectChanges)) {
    out = { ...out, effects: applyVariantIdChanges(out.effects, modifiers.effectChanges, 'effectId') };
  }
  return out;
};

/** Expand Fallout true-item variants against their direct or catalog base rows. */
export const expandFalloutCatalogItems = (entries = [], baseEntries = []) => {
  const entryById = new Map();
  [...(baseEntries || []), ...(entries || [])].forEach((entry) => {
    if (entry?.id) entryById.set(entry.id, entry);
  });

  const resolved = new Map();
  const resolving = new Set();
  const resolve = (entry) => {
    if (!entry || !entry.trueItemId) return entry;
    if (resolved.has(entry.id)) return resolved.get(entry.id);
    if (resolving.has(entry.id)) {
      throw new Error(`[packMerge] Cyclic trueItemId reference at "${entry.id}"`);
    }
    const base = entryById.get(entry.trueItemId);
    if (!base) return entry;

    resolving.add(entry.id);
    const expandedBase = resolve(base);
    const merged = deepMerge(expandedBase, entry);
    const output = applyFalloutVariantModifiers(merged, entry.modifiers);
    resolving.delete(entry.id);
    resolved.set(entry.id, output);
    return output;
  };

  return (entries || []).map(resolve);
};
