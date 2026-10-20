import { set as setCounter } from '../../../domain/counters.js';
import { getDerivedStatsLogic } from '../../../domain/registry.js';
import { selectLegacyAttributes } from '../../../src/store/selectors.js';

export const FALLOUT_RESOURCE_FIELDS = Object.freeze({
  radiation: 'radiation',
});

export const FALLOUT_RESOURCE_IDS = Object.freeze({
  radiation: 'fallout.character.radiation',
});

export const getFalloutRadiation = (state) => {
  const value = Number(state?.stateExtensions?.[FALLOUT_RESOURCE_FIELDS.radiation] ?? state?.radiation);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export const getFalloutRadiationGainHealing = ({ state, radiationGain }) => {
  const healingRule = state?.perkBonuses?.ghoulish;
  if (!healingRule || !(radiationGain > 0)) return 0;
  const unitsPerHitPoint = Number(healingRule.hpPerUnits) || 4;
  return Math.floor(radiationGain / unitsPerHitPoint);
};

/** Setting-owned resource semantics dispatched by the engine's generic API. */
export const applyFalloutResourceMutation = ({
  resourceId,
  valueOrUpdater,
  options = {},
  get,
  set,
} = {}) => {
  if (resourceId !== FALLOUT_RESOURCE_IDS.radiation) {
    return { ok: false, reason: 'unsupportedResource' };
  }
  if (typeof get !== 'function' || typeof set !== 'function') {
    return { ok: false, reason: 'storeUnavailable' };
  }

  set((state) => {
    const current = getFalloutRadiation(state);
    const requested = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(current)
      : valueOrUpdater;
    const next = setCounter(
      { id: resourceId, current, max: null, min: 0 },
      requested,
    ).current;
    const radiationGain = next - current;
    const healing = !options.skipSettingRadiationGainHealing && radiationGain > 0
      ? getFalloutRadiationGainHealing({ state, radiationGain })
      : 0;
    const extensions = {
      ...(state.stateExtensions || {}),
      [FALLOUT_RESOURCE_FIELDS.radiation]: next,
    };

    if (healing > 0) {
      const calculateMaxHealth = getDerivedStatsLogic()?.calculateMaxHealth;
      const maxHealth = typeof calculateMaxHealth === 'function'
        ? calculateMaxHealth(
          selectLegacyAttributes({ attributes: state.attributes }),
          state.level,
        )
        : 0;
      const appliedHealing = Math.min(
        healing,
        Math.max(0, maxHealth - state.currentHealth),
      );
      if (appliedHealing > 0) {
        return {
          stateExtensions: extensions,
          currentHealth: state.currentHealth + appliedHealing,
        };
      }
    }

    return { stateExtensions: extensions };
  });

  return { ok: true, value: getFalloutRadiation(get()) };
};
