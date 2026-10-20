// Mutually exclusive weapon qualities. IDs are locale-independent catalog keys.
export const WEAPON_QUALITY_OPPOSITES = Object.freeze({
  quality_accurate: 'quality_inaccurate',
  quality_inaccurate: 'quality_accurate',
  quality_reliable: 'quality_unreliable',
  quality_unreliable: 'quality_reliable',
});

/** Removes the opposite quality before adding a mutually exclusive one. */
export const applyQualityGain = (qualities, quality) => {
  const qualityId = quality?.qualityId || quality?.id;
  const opposite = WEAPON_QUALITY_OPPOSITES[qualityId];
  if (opposite) qualities.delete(opposite);
  qualities.set(qualityId, quality?.value != null ? { qualityId, value: quality.value } : { qualityId });
};


/** Normalizes a saved array of qualities; for a conflicting pair, the last entry wins. */
export const resolveMutuallyExclusiveQualities = (qualities) => {
  if (!Array.isArray(qualities)) return qualities;
  const byId = new Map();
  qualities.forEach((quality) => {
    const qualityId = quality?.qualityId || quality?.id || quality;
    if (!qualityId) return;
    applyQualityGain(byId, typeof quality === 'string' ? { qualityId } : quality);
  });
  return [...byId.values()];
};
