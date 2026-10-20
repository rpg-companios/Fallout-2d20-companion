// Generic object and user-pack merge helpers. Setting-specific catalog variant
// inheritance lives behind the active setting's inventory capability.
import { deepMerge } from './deepMerge.js';
export { deepMerge };

/** Apply per-ID object overlays without mutating the source array. */
export function applyOverridesById(data = [], overrides = {}) {
  return (data || []).map((entry) => {
    const override = overrides?.[entry.id];
    return override !== undefined ? deepMerge(entry, override) : entry;
  });
}

/** Return override keys that do not correspond to a source record. */
export function findUnknownOverrideIds(data = [], overrides = {}) {
  const known = new Set((data || []).map((entry) => entry.id));
  return Object.keys(overrides || {}).filter((id) => !known.has(id));
}
