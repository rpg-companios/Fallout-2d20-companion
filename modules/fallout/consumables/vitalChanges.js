import { resolveConsumableRadiationAmount } from './radiation.js';
import { FALLOUT_RESOURCE_IDS, getFalloutRadiation } from '../logic/radiationResource.js';

export const FALLOUT_VITAL_TARGET_IDS = Object.freeze({
  currentHealth: 'fallout.character.currentHealth',
  radiation: FALLOUT_RESOURCE_IDS.radiation,
});

/** Declare setting-owned target IDs; the engine performs the numeric application. */
export const getFalloutVitalTargets = ({ state, maxHealth, get }) => ({
  [FALLOUT_VITAL_TARGET_IDS.currentHealth]: {
    value: state.currentHealth,
    max: maxHealth,
    clampMax: true,
    apply: (value) => get().setCurrentHealth(value),
  },
  [FALLOUT_VITAL_TARGET_IDS.radiation]: {
    value: getFalloutRadiation(state),
    min: 0,
    clampMin: true,
    apply: (value) => get().applySettingResourceMutation(
      FALLOUT_RESOURCE_IDS.radiation,
      value,
      { skipSettingRadiationGainHealing: true },
    ),
  },
});

/**
 * Read Fallout catalog healing fields from a consumable item.
 * `positiveEffect.hpModifier` is used by food/chems; `hpHealed` and
 * `healAmount` are legacy drink fields retained for existing catalogs/saves.
 */
export const getInstantHealAmount = (item) => {
  if (!item) return 0;
  const positiveEffect = item.positiveEffect;
  if (positiveEffect && typeof positiveEffect === 'object' && positiveEffect.hpModifier?.op === '+') {
    return Number(positiveEffect.hpModifier.value) || 0;
  }
  if (item.hpHealed != null) return Number(item.hpHealed) || 0;
  if (item.healAmount != null) return Number(item.healAmount) || 0;
  return 0;
};

/**
 * Resolve Fallout consumable effects against the current character values.
 * Healing is calculated first; radiation changes only the counter and does
 * not apply body-part damage resistance.
 */
export const resolveConsumableVitalChanges = (item, options = {}) => {
  const {
    currentHealth,
    maxHealth,
    radiation,
    hpHealBonus = 0,
    hpHealMultiplier = 1,
    radiationImmune = false,
    skipIrradiatedRadiation = false,
    // Already filtered by Fallout's optional consumables rules.
    preservedFoodBonus = null,
    eligibleItemHealBonus = 0,
    radiationRemovalBonus = 0,
    radiationHealing = null,
  } = options;
  if (
    !Number.isFinite(currentHealth)
    || !Number.isFinite(maxHealth)
    || !Number.isFinite(radiation)
    || !Number.isFinite(hpHealBonus)
    || !Number.isFinite(hpHealMultiplier)
    || hpHealMultiplier <= 0
  ) {
    throw new Error('[effects] Некорректное состояние персонажа для применения расходника');
  }

  const instantHealAmount = getInstantHealAmount(item) * hpHealMultiplier;
  const stimpakBonus = eligibleItemHealBonus > 0 ? eligibleItemHealBonus : 0;
  let healBase = instantHealAmount
    + (preservedFoodBonus ? Number(preservedFoodBonus.hpBonus) || 0 : 0)
    + stimpakBonus;
  const healAmount = healBase > 0
    ? Math.max(0, healBase + hpHealBonus)
    : 0;
  const healthAfter = healAmount > 0
    ? Math.min(maxHealth, currentHealth + healAmount)
    : currentHealth;

  // Strict order: compute healing, then resolve and apply radiation.
  let requestedRadiationAmount = Object.hasOwn(options, 'radiationRequestedAmount')
    ? options.radiationRequestedAmount
    : resolveConsumableRadiationAmount(item, { radiationImmune, skipIrradiatedRadiation });
  // Positive radiation from preserved food may be reduced; removal is untouched.
  if (preservedFoodBonus && typeof requestedRadiationAmount === 'number' && requestedRadiationAmount > 0) {
    requestedRadiationAmount = Math.max(
      0,
      requestedRadiationAmount - (Number(preservedFoodBonus.radiationReduction) || 0),
    );
  }
  if (radiationRemovalBonus > 0 && typeof requestedRadiationAmount === 'number' && requestedRadiationAmount < 0) {
    requestedRadiationAmount -= radiationRemovalBonus;
  }
  const radiationHealingUnits = radiationHealing
    ? (Number(radiationHealing?.hpPerUnits) || 4)
    : 0;
  if (radiationHealingUnits > 0 && typeof requestedRadiationAmount === 'number' && requestedRadiationAmount > 0) {
    healBase += Math.floor(requestedRadiationAmount / radiationHealingUnits);
  }
  const finalHealAmount = healBase > 0 ? Math.max(0, healBase + hpHealBonus) : 0;
  const radiationAfter = requestedRadiationAmount === null
    ? radiation
    : Math.max(0, radiation + requestedRadiationAmount);
  // Report actual delta: radiation=2 with modifier -4 removes only 2 points.
  const radiationAmount = requestedRadiationAmount === null
    ? null
    : radiationAfter - radiation;

  // Radiation-based healing is included before the final health clamp.
  const finalHealthAfter = finalHealAmount !== healAmount
    ? (finalHealAmount > 0
      ? Math.min(maxHealth, currentHealth + finalHealAmount)
      : currentHealth)
    : healthAfter;

  return {
    healAmount: finalHealAmount,
    healthAfter: finalHealthAfter,
    radiationAmount,
    radiationAfter,
  };
};

/** Build opaque target-ID operations for the generic engine modifier applier. */
export const resolveConsumableVitalModifiers = (item, options = {}) => {
  const report = resolveConsumableVitalChanges(item, options);
  const modifiers = [];
  if (report.healAmount > 0) {
    modifiers.push({
      targetId: FALLOUT_VITAL_TARGET_IDS.currentHealth,
      operation: '+',
      value: report.healAmount,
    });
  }
  if (report.radiationAmount !== null) {
    modifiers.push({
      targetId: FALLOUT_VITAL_TARGET_IDS.radiation,
      operation: '+',
      value: report.radiationAmount,
    });
  }
  return { ...report, modifiers };
};
