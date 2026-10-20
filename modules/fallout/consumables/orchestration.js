// Fallout consumable rules and item-payload interpretation. The engine owns
// store mutations and generic timed-effect lifecycle; this capability resolves
// setting-shaped effects, vital changes, perk modifiers, chem duration, and addiction.
import { recordDoseWithinWindow } from '../../../domain/effects.js';
import { applyFalloutConsumableToEffects, scaleDuration } from './effectApplication.js';
import { checkAddiction } from './addiction.js';
import { previewFalloutConsumableRadiation } from './radiation.js';
import {
  getFalloutRadiation,
  getFalloutRadiationGainHealing,
} from '../logic/radiationResource.js';
import { hasRadiationImmunity } from '../logic/immunities.js';
import {
  getFalloutVitalTargets,
  resolveConsumableVitalModifiers,
} from './vitalChanges.js';
import { syncTimedEffectsToStore } from '../../../src/store/effectsSync.js';

export const CHEM_DOSE_WINDOW_MS = 24 * 60 * 60 * 1000;

const FALLOUT_CONSUMABLE_ITEM_FIELDS = Object.freeze([
  'positiveEffect',
  'positiveEffectDuration',
  'positiveEffectLabel',
  'negativeEffect',
  'negativeEffectDuration',
  'negativeEffectLabel',
  'addictionLevel',
]);

export const getFalloutConsumableItemStoreFields = (item) => Object.fromEntries(
  FALLOUT_CONSUMABLE_ITEM_FIELDS.map((field) => [field, item?.[field]]),
);

export const isFalloutConsumableItem = (item) => (
  ['chem', 'chems', 'drinks', 'food', 'robotConsumable'].includes(item?.itemType)
  || item?.healAmount != null
);

export const previewFalloutRadiationForCharacter = ({ item, state } = {}) => (
  previewFalloutConsumableRadiation({
    item,
    state: { ...state, radiation: getFalloutRadiation(state) },
    radiationImmune: hasRadiationImmunity(state),
  })
);

const getFalloutVitalChangeResultFields = ({ healAmount, radiationAmount } = {}) => ({
  healAmount,
  radiationAmount,
});

export const createFalloutConsumableOrchestrationActions = ({ get, set }) => {
  const prepareConsumableEffectItem = ({ item, state }) => {
    const perkBonuses = state.perkBonuses || {};
    const isChemItem = item?.itemType === 'chem' || item?.itemType === 'chems';
    const durationMultiplier = isChemItem
      ? (Number(perkBonuses.chemDurationMultiplier) || 1)
      : 1;
    return durationMultiplier > 1
      ? { ...item, positiveEffectDuration: scaleDuration(item?.positiveEffectDuration, durationMultiplier) }
      : item;
  };

  const getVitalChangeOptions = ({ item, state, options = {} }) => {
    const {
      hpHealBonus = 0,
      irradiatedConsumableRadiationImmune = false,
      colaNutDrinkIds,
      colaNutHealMultiplier = 1,
      oldWorldGourmet = null,
      stimpakHpBonus = 0,
      antiradRadiationBonus = 0,
      ghoulish = false,
      bloodPackDrinkIds,
      bloodPackHealMultiplier = 1,
    } = state.perkBonuses || {};

    let hpHealMultiplier = Array.isArray(colaNutDrinkIds) && colaNutDrinkIds.includes(item?.id)
      ? Number(colaNutHealMultiplier) || 1
      : 1;
    if (Array.isArray(bloodPackDrinkIds) && bloodPackDrinkIds.includes(item?.id)) {
      hpHealMultiplier *= Number(bloodPackHealMultiplier) || 1;
    }
    const isPreservedFood = item?.itemType === 'food' && item?.preserved === true;
    const isStimpak = String(item?.id || '').startsWith('chem_stimpak');
    return {
      hpHealBonus,
      hpHealMultiplier,
      skipIrradiatedRadiation: Boolean(irradiatedConsumableRadiationImmune),
      preservedFoodBonus: isPreservedFood ? oldWorldGourmet : null,
      eligibleItemHealBonus: isStimpak ? stimpakHpBonus : 0,
      radiationRemovalBonus: antiradRadiationBonus,
      radiationHealing: ghoulish,
      radiation: getFalloutRadiation(state),
      radiationImmune: hasRadiationImmunity(state),
      ...(Object.hasOwn(options, 'radiationRequestedAmount')
        ? { radiationRequestedAmount: options.radiationRequestedAmount }
        : {}),
    };
  };

  const recordChemDose = (chemId) => {
    const now = Date.now();
    const state = get();
    const result = recordDoseWithinWindow(
      state.stateExtensions?.chemDosesLog ?? [],
      { chemId, takenAt: now },
      { now, windowMs: CHEM_DOSE_WINDOW_MS },
    );
    state.setStateExtension('chemDosesLog', result.doseLog);
    return result.doseCount;
  };

  const applyAddictionForConsumable = ({ item, state, effects }) => {
    const dosesToday = item?.itemType === 'chem'
      ? recordChemDose(item.id)
      : 0;

    const hasPartyBoyImmunity = item?.isAlcohol === true
      && Boolean(state.perkBonuses.alcoholAddictionImmune);
    const isChemItem = item?.itemType === 'chem' || item?.itemType === 'chems';
    const hasChemAddictionImmunity = isChemItem
      && Boolean(state.perkBonuses.chemAddictionImmune);
    const isShadowCharacter = state.origin?.id === 'shadow' || state.trait?.id === 'shadow';
    const isStealthBoy = item?.id === 'chem_stealth_boy' || item?.id === 'stealth_boy';

    let addictionResult = null;
    if (
      item?.addictionLevel > 0
      && item?.negativeEffect === 'addiction'
      && !hasPartyBoyImmunity
      && !hasChemAddictionImmunity
      && (!isStealthBoy || isShadowCharacter)
    ) {
      // Shadow characters can become addicted to Stealth Boys on any Combat
      // Dice effect; other Fallout addiction checks use the item's rank target.
      const anyEffect = isShadowCharacter && isStealthBoy;
      addictionResult = checkAddiction(item, dosesToday, {
        anyEffect,
        dicePenalty: isChemItem ? (Number(state.perkBonuses.chemAddictionDicePenalty) || 0) : 0,
      });
      if (addictionResult.addicted && !state.conditions.includes('addicted')) {
        set((current) => ({ conditions: [...current.conditions, 'addicted'] }));
        if (isStealthBoy) {
          const addictionEffect = {
            id: `negative-addiction-stealth-boy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            effectName: 'Зависимость: Стелс-бой',
            effectLabel: 'Сложность тестов на восприятие и интеллект повышается на +2, а тестов на харизму на +1, пока не вылечитесь.',
            effectKind: 'negative',
            sourceName: 'Стелс-бой',
            createdAt: Date.now(),
            isPermanent: true,
            scenesLeft: 9999,
          };
          syncTimedEffectsToStore([...effects, addictionEffect], get());
        }
      }
    }
    return addictionResult;
  };

  return Object.freeze({
    prepareConsumableEffectItem,
    getVitalChangeOptions,
    applyAddictionForConsumable,
  });
};

export const FALLOUT_CONSUMABLE_CAPABILITY = Object.freeze({
  createOrchestrationActions: createFalloutConsumableOrchestrationActions,
  applyTimedEffects: applyFalloutConsumableToEffects,
  getItemStoreFields: getFalloutConsumableItemStoreFields,
  isConsumableItem: isFalloutConsumableItem,
  chemDoseWindowMs: CHEM_DOSE_WINDOW_MS,
  getRadiationGainHealing: getFalloutRadiationGainHealing,
  getVitalTargets: getFalloutVitalTargets,
  getVitalChangeResultFields: getFalloutVitalChangeResultFields,
  previewRadiation: previewFalloutRadiationForCharacter,
  resolveVitalChanges: resolveConsumableVitalModifiers,
});
