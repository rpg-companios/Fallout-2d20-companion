// Fallout disease orchestration. The engine owns the character store and
// consumable pipeline; this optional capability owns disease IDs, checks,
// treatment and effects. It is created lazily by the active setting runtime.
import {
  effectsDictToLegacyArray,
  syncTimedEffectsToStore,
} from '../../../src/store/effectsSync.js';
import { selectLegacyAttributes, selectLegacySkills } from '../../../src/store/selectors.js';
import { pruneExpiredTimedEffects } from '../../../domain/effects.js';
import { hasDamageImmunity } from '../../../domain/immunities.js';
import { createSceneRiskTracker, getSceneRiskEventForRule } from '../../../domain/sceneRiskChecks.js';
import { isSkillTagged } from '../../../domain/d20Checks.js';
import { getFalloutDiseaseCatalog, getFalloutSceneRiskRules } from './catalog.js';
import { getCurrentModuleLocale } from '../../../i18n/locale.js';
import { getAttributeValue } from '../logic/characterCreation.js';
import {
  addPersistentDiseaseEffect,
  removePersistentDiseaseEffects,
  reduceDiseaseRanks,
  increaseDiseaseRank,
  effectDiseaseRank,
  resistDiseaseRoll,
  rollDiseaseFromCatalog,
  DISEASE_RESIST_COOLDOWN_MS,
} from './diseaseConditions.js';

export const DISEASE_CONDITION_ID = 'diseased';
export const DISEASE_ATTRIBUTE_KEY = 'END';
export const DISEASE_SKILL_KEY = 'SURVIVAL';
export const ANTIBIOTIC_CHEM_WINDOW_MS = 24 * 60 * 60 * 1000;

export const createFalloutDiseaseOrchestrationActions = ({ get, set, notifyConditionEvent }) => {
  const notifyDiseaseEvent = (event) => notifyConditionEvent?.(event);

  const reducePersistentDiseaseRanks = (amount) => {
    const storeNow = get();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(storeNow.effects)).effects;
    const treated = reduceDiseaseRanks(currentEffects, amount);
    syncTimedEffectsToStore(treated.effects, storeNow);
    for (const conditionId of treated.healed) {
      notifyDiseaseEvent({ kind: 'disease', event: 'cured', conditionId });
    }
    const diseasesLeft = treated.effects.filter((effect) => effect.effectType === 'disease').length;
    if (diseasesLeft === 0 && storeNow.conditions.includes(DISEASE_CONDITION_ID)) {
      set((state) => ({
        conditions: state.conditions.filter((condition) => condition !== DISEASE_CONDITION_ID),
      }));
    }
    return { healed: treated.healed, diseasesLeft };
  };

  const applyDiseaseExposureEvent = (eventId) => {
    const state = get();
    const ruleMatches = getFalloutSceneRiskRules()
      .map((rule) => ({
        rule,
        event: Array.isArray(rule.eventTypes) && rule.eventTypes.includes(eventId)
          ? { eventId }
          : null,
      }))
      .filter(({ event }) => event !== null);
    if (ruleMatches.length === 0) return null;
    if (ruleMatches.length > 1) {
      throw new Error(`[fallout:diseases] Event "${eventId}" has multiple risk rules`);
    }

    const { rule, event } = ruleMatches[0];
    if (rule.resultTable !== 'diseases') {
      throw new Error(`[fallout:diseases] Unsupported risk result table: ${rule.resultTable}`);
    }

    const legacyAttributes = selectLegacyAttributes({ attributes: state.attributes });
    const legacySkills = selectLegacySkills({ skills: state.skills });
    const attribute = legacyAttributes.find((entry) => entry?.name === rule.test.attribute);
    const skill = legacySkills.find((entry) => entry?.name === rule.test.skill);
    if (!attribute || !skill) {
      throw new Error(
        `[fallout:diseases] Risk rule "${rule.id}" requires `
        + `${rule.test.attribute} and ${rule.test.skill}`,
      );
    }

    const tracker = createSceneRiskTracker(state.sceneRiskStates || {});
    const { result, states } = tracker.resolveEvent({
      rule,
      eventId: event.eventId,
      attributeValue: getAttributeValue(legacyAttributes, rule.test.attribute),
      skillValue: skill.value,
      isTagged: isSkillTagged({
        skillId: skill.name,
        primaryTaggedSkillIds: state.selectedSkills,
        extraTaggedSkillIds: state.extraTaggedSkills,
      }),
    });
    if (result.status === 'duplicate') return result;

    get().setSceneRiskStates(states);
    if (result.check.passed) {
      return { ...result, diseaseRoll: null, disease: null, infectionStatus: null };
    }

    const { roll: diseaseRoll, disease } = rollDiseaseFromCatalog(
      getFalloutDiseaseCatalog(getCurrentModuleLocale()),
    );
    if (hasDamageImmunity({ origin: state.origin, trait: state.trait }, rule.immunity)) {
      return { ...result, diseaseRoll, disease, infectionStatus: 'immune' };
    }

    const store = get();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(store.effects)).effects;
    const applied = addPersistentDiseaseEffect(currentEffects, disease);
    if (applied.added) syncTimedEffectsToStore(applied.effects, store);
    set((current) => ({
      conditions: current.conditions.includes(DISEASE_CONDITION_ID)
        ? current.conditions
        : [...current.conditions, DISEASE_CONDITION_ID],
    }));
    if (applied.added) {
      notifyDiseaseEvent({ kind: 'disease', event: 'infected', conditionId: disease.id });
    }
    return {
      ...result,
      diseaseRoll,
      disease,
      infectionStatus: applied.added ? 'infected' : 'duplicate',
    };
  };

  const applyDiseaseExposureForConsumable = (item) => {
    if (item?.id === 'drink_dirty_water' && Boolean(get().perkBonuses?.dirtyWaterDiseaseImmune)) {
      return null;
    }
    const ruleMatches = getFalloutSceneRiskRules()
      .map((rule) => ({ rule, event: getSceneRiskEventForRule(item, rule.id) }))
      .filter(({ event }) => event !== null);
    if (ruleMatches.length === 0) return null;
    if (ruleMatches.length > 1) {
      throw new Error('[fallout:diseases] Consumable matches multiple risk rules');
    }
    return applyDiseaseExposureEvent(ruleMatches[0].event.eventId);
  };

  const resistDisease = (conditionId) => {
    const now = Date.now();
    const state = get();
    const lastDiseaseResistAt = state.stateExtensions?.lastDiseaseResistAt ?? null;
    if (lastDiseaseResistAt != null && now - lastDiseaseResistAt < DISEASE_RESIST_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        retryInMs: DISEASE_RESIST_COOLDOWN_MS - (now - lastDiseaseResistAt),
      };
    }

    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(state.effects)).effects;
    const effect = currentEffects.find((entry) => (
      entry.effectType === 'disease' && entry.conditionId === conditionId
    ));
    if (!effect) return { ok: false, reason: 'notFound' };

    const legacyAttributes = selectLegacyAttributes({ attributes: state.attributes });
    const legacySkills = selectLegacySkills({ skills: state.skills });
    const attribute = legacyAttributes.find((entry) => entry?.name === DISEASE_ATTRIBUTE_KEY);
    const skill = legacySkills.find((entry) => entry?.name === DISEASE_SKILL_KEY);
    if (!attribute || !skill) {
      throw new Error(
        `[fallout:diseases] Character is missing ${DISEASE_ATTRIBUTE_KEY} or ${DISEASE_SKILL_KEY}`,
      );
    }
    const isTagged = isSkillTagged({
      skillId: DISEASE_SKILL_KEY,
      primaryTaggedSkillIds: state.selectedSkills,
      extraTaggedSkillIds: state.extraTaggedSkills,
    });
    const rankBefore = effectDiseaseRank(effect);
    const roll = resistDiseaseRoll({
      targetNumber: getAttributeValue(legacyAttributes, DISEASE_ATTRIBUTE_KEY) + skill.value,
      taggedSurvivalRank: isTagged ? skill.value : null,
      diseaseRank: rankBefore,
    });
    get().setStateExtension('lastDiseaseResistAt', now);

    let rankAfter = rankBefore;
    if (roll.cured) {
      const withoutDisease = currentEffects.filter((entry) => entry !== effect);
      syncTimedEffectsToStore(withoutDisease, get());
      notifyDiseaseEvent({ kind: 'disease', event: 'cured', conditionId });
      if (!withoutDisease.some((entry) => entry.effectType === 'disease')
        && get().conditions.includes(DISEASE_CONDITION_ID)) {
        set((current) => ({
          conditions: current.conditions.filter((condition) => condition !== DISEASE_CONDITION_ID),
        }));
      }
    } else if (roll.rankIncrease > 0) {
      rankAfter = rankBefore + roll.rankIncrease;
      syncTimedEffectsToStore(
        increaseDiseaseRank(currentEffects, conditionId, roll.rankIncrease),
        get(),
      );
    }
    return { ok: true, diseaseName: effect.effectName, ...roll, rankBefore, rankAfter };
  };

  const handleConditionRemoval = ({ item, state, removedRaw, conditionRemovalsRequested }) => {
    const removesDisease = removedRaw.includes(DISEASE_CONDITION_ID);
    const removesAddiction = removedRaw.includes('addicted');
    if (!removesDisease && !removesAddiction) return { handled: false };

    let removed = removedRaw;
    let diseaseTreatment = null;
    const antibioticRequested = removesDisease
      && conditionRemovalsRequested.includes(DISEASE_CONDITION_ID)
      && item?.antibiotic === true;

    if (antibioticRequested) {
      const lastDose = (state.stateExtensions?.chemDosesLog ?? [])
        .filter((dose) => dose.chemId === item.id)
        .map((dose) => dose.takenAt)
        .sort((left, right) => right - left)[0];
      const onCooldown = lastDose != null && Date.now() - lastDose < ANTIBIOTIC_CHEM_WINDOW_MS;
      if (onCooldown) {
        diseaseTreatment = { blocked: true };
        removed = removedRaw.filter((condition) => condition !== DISEASE_CONDITION_ID);
      } else {
        const treatment = reducePersistentDiseaseRanks(1);
        diseaseTreatment = { blocked: false, ...treatment };
        removed = treatment.diseasesLeft === 0
          ? removedRaw
          : removedRaw.filter((condition) => condition !== DISEASE_CONDITION_ID);
      }
      // Legacy antibiotic handling intentionally bypasses the unrelated
      // addiction-effect cleanup when the same item removes both conditions.
      return { handled: true, removed, diseaseTreatment };
    }

    const afterGenericRemoval = () => {
      if (removesAddiction) {
        const store = get();
        const currentEffects = effectsDictToLegacyArray(store.effects);
        const withoutAddiction = currentEffects.filter(
          (effect) => !(effect.isPermanent && String(effect.effectName || '').includes('Зависимость')),
        );
        syncTimedEffectsToStore(withoutAddiction, store);
      }
      if (removesDisease) {
        const store = get();
        const currentEffects = effectsDictToLegacyArray(store.effects);
        const withoutDiseases = removePersistentDiseaseEffects(currentEffects);
        syncTimedEffectsToStore(withoutDiseases.effects, store);
        for (const cured of withoutDiseases.removed) {
          notifyDiseaseEvent({ kind: 'disease', event: 'cured', conditionId: cured.conditionId });
        }
      }
    };
    return { handled: true, removed, diseaseTreatment, afterGenericRemoval };
  };

  return Object.freeze({
    applyDiseaseExposureEvent,
    applyDiseaseExposureForConsumable,
    reducePersistentDiseaseRanks,
    resistDisease,
    handleConditionRemoval,
  });
};

export const FALLOUT_DISEASE_CAPABILITY = Object.freeze({
  createOrchestrationActions: createFalloutDiseaseOrchestrationActions,
  conditionId: DISEASE_CONDITION_ID,
  attributeKey: DISEASE_ATTRIBUTE_KEY,
  skillKey: DISEASE_SKILL_KEY,
  resistCooldownMs: DISEASE_RESIST_COOLDOWN_MS,
  getEffectRank: effectDiseaseRank,
});
