import diseasesFile from '../data/conditions/diseases.json';

const DISEASE_RANK_BY_ID = new Map(
  (Array.isArray(diseasesFile) ? diseasesFile : []).map((entry) => [entry.id, entry.duration]),
);

/**
 * v24 -> v25: add the disease catalog rank to timed disease effects that do
 * not already carry one. Existing valid ranks and non-disease effects remain
 * unchanged.
 */
export const migrateDiseaseRanks = (state) => {
  if (!state || typeof state !== 'object') return state;
  if (!Array.isArray(state.activeTimedEffects)) return state;
  const effects = state.activeTimedEffects.map((effect) => {
    if (!effect || effect.effectType !== 'disease') return effect;
    if (Number.isInteger(effect.rank) && effect.rank >= 1) return effect;
    const duration = DISEASE_RANK_BY_ID.get(effect.conditionId);
    if (!Number.isInteger(duration) || duration < 1) return effect;
    return { ...effect, rank: duration };
  });
  return { ...state, activeTimedEffects: effects };
};
