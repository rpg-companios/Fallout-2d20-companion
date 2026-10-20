// src/store/orchestratorsSlice.js
//
// Engine-side orchestration: generic consumable pipeline and timed-effect
// bridge. Setting-specific mechanics are resolved through optional runtime
// capabilities; this slice owns shared state updates and has no setting fallback.
//
// Сеттинговые уведомления (notifyConditionEvent / notifyConsumableApplied)
// получают ctx = { stateExtensions, setStateExtension } прямо из стора —
// реестр расширений ничего не знает о React.
//
// Shared effect lifecycle utilities live in domain/effects.js; setting payload
// interpretation and formulas are optional services from the active registry.

import { debugLog } from '../engine/debug/runtimeTrace.js';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from './effectsSync.js';
import { selectLegacyAttributes } from './selectors.js';
import {
  applyRemoveConditions,
  advanceEffectsByScenes,
  pruneExpiredTimedEffects,
  SCENE_RULES,
} from '../../domain/effects';
import { resolveTargetedNumericModifiers } from '../../domain/numericModifier.js';
import { getDerivedStatsLogic, getSettingService } from '../../domain/registry';

// Resolve only when called: the engine must also initialize with no package.
// No active setting means no setting-specific health formula.
const calculateMaxHealth = (...args) => (
  getDerivedStatsLogic()?.calculateMaxHealth?.(...args) ?? 0
);
import { notifyConditionEvent, notifyConsumableApplied } from './stateExtensions';

/**
 * @param {function} set - zustand set
 * @param {function} get - zustand get
 */
export const createOrchestrationActions = (set, get) => {
  const notificationCtx = () => ({
    stateExtensions: get().stateExtensions,
    setStateExtension: get().setStateExtension,
  });

  // Disease mechanics are an optional setting capability. Keep stable store
  // action names for setting screens and saves, but do not embed a game-specific
  // implementation or fallback in the engine.
  let cachedDiseaseCapability = null;
  let cachedDiseaseActions = null;
  const getDiseaseActions = () => {
    const capability = getSettingService('diseases');
    if (!capability?.createOrchestrationActions) {
      cachedDiseaseCapability = capability;
      cachedDiseaseActions = null;
      return null;
    }
    if (capability !== cachedDiseaseCapability) {
      cachedDiseaseCapability = capability;
      cachedDiseaseActions = capability.createOrchestrationActions({
        get,
        set,
        notifyConditionEvent: (event) => notifyConditionEvent(event, notificationCtx()),
      });
    }
    return cachedDiseaseActions;
  };

  const applyDiseaseExposureEvent = (eventId) => (
    getDiseaseActions()?.applyDiseaseExposureEvent(eventId) ?? null
  );
  const reducePersistentDiseaseRanks = (amount) => (
    getDiseaseActions()?.reducePersistentDiseaseRanks(amount)
    ?? { healed: [], diseasesLeft: 0 }
  );
  const resistDisease = (conditionId) => (
    getDiseaseActions()?.resistDisease(conditionId)
    ?? { ok: false, reason: 'unavailable' }
  );
  const applyDiseaseExposureForConsumable = (item) => (
    getDiseaseActions()?.applyDiseaseExposureForConsumable(item) ?? null
  );

  // Setting-owned addiction/chem rules are a separate optional capability.
  // The shared pipeline calls them only after generic effect application.
  let cachedConsumableCapability = null;
  let cachedConsumableActions = null;
  const getConsumableActions = () => {
    const capability = getSettingService('consumables');
    if (!capability?.createOrchestrationActions) {
      cachedConsumableCapability = capability;
      cachedConsumableActions = null;
      return null;
    }
    if (capability !== cachedConsumableCapability) {
      cachedConsumableCapability = capability;
      cachedConsumableActions = capability.createOrchestrationActions({ get, set });
    }
    return cachedConsumableActions;
  };
  const applySettingAddictionForConsumable = (args) => (
    getConsumableActions()?.applyAddictionForConsumable(args) ?? null
  );

  /**
   * Применяет общие изменения здоровья/радиации и timed-эффекты, затем
   * вызывает optional capabilities активного сеттинга для дополнительных правил.
   */
  const applyConsumableFull = (item, options = {}) => {
    debugLog('consumable.apply.start', {
      itemName: item?.name || item?.Name,
      itemId: item?.id || item?.code,
    });

    // 1. Apply setting-resolved changes to generic numeric targets.
    const state = get();
    const settingVitalOptions = getConsumableActions()?.getVitalChangeOptions?.({
      item,
      state,
      options,
    }) ?? {};
    const vitalOptions = {
      ...settingVitalOptions,
      currentHealth: state.currentHealth,
      maxHealth: calculateMaxHealth(
        selectLegacyAttributes({ attributes: state.attributes }),
        state.level,
      ),
    };
    const consumablesCapability = getSettingService('consumables');
    const vitalChanges = consumablesCapability?.resolveVitalChanges?.(item, vitalOptions)
      ?? { modifiers: [] };
    const getVitalChangeResultFields = consumablesCapability?.getVitalChangeResultFields;
    const vitalChangeResultFields = typeof getVitalChangeResultFields === 'function'
      ? getVitalChangeResultFields(vitalChanges)
      : {};
    const vitalTargets = consumablesCapability?.getVitalTargets?.({
      state,
      maxHealth: vitalOptions.maxHealth,
      get,
    }) ?? {};
    const appliedVitalModifiers = resolveTargetedNumericModifiers(
      vitalTargets,
      vitalChanges.modifiers ?? [],
    );
    for (const { targetId } of appliedVitalModifiers) {
      if (typeof vitalTargets[targetId]?.apply !== 'function') {
        throw new Error(`[orchestrators] Target "${targetId}" has no setting apply handler`);
      }
    }
    for (const { targetId, value } of appliedVitalModifiers) {
      vitalTargets[targetId].apply(value);
    }

    // 2. Timed-эффекты через стор.
    const store = get();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

    const itemForEffects = getConsumableActions()?.prepareConsumableEffectItem?.({ item, state }) ?? item;
    const timedResult = consumablesCapability?.applyTimedEffects?.(
      itemForEffects,
      normalizedCurrent.effects,
    ) ?? {
      effects: normalizedCurrent.effects,
      events: [],
      notificationEvents: [],
    };
    const normalizedResult = pruneExpiredTimedEffects(timedResult.effects);
    syncTimedEffectsToStore(normalizedResult.effects, store);

    // 3. Generic condition removal, optionally extended by the active setting.
    // The capability can apply setting-owned effects/treatment while the
    // engine retains ownership of the shared condition list.
    const {
      conditions: nextConditions,
      removed: removedRaw,
      requested: conditionRemovalsRequested,
    } = applyRemoveConditions(item, state.conditions);
    const diseaseHandling = getDiseaseActions()?.handleConditionRemoval?.({
      item,
      state,
      removedRaw,
      conditionRemovalsRequested,
    }) ?? null;
    const removed = diseaseHandling?.removed ?? removedRaw;
    const diseaseTreatment = diseaseHandling?.diseaseTreatment ?? null;
    if (removedRaw.length > 0) {
      set({ conditions: nextConditions });
      diseaseHandling?.afterGenericRemoval?.();
    }

    // 4. Setting-owned consumable rules (chem/addiction handling).
    const addictionResult = applySettingAddictionForConsumable({
      item,
      state,
      effects: normalizedResult.effects,
    });

    const diseaseRiskResult = applyDiseaseExposureForConsumable(item);

    // Notify registered setting extensions after the consumable is applied.
    // The engine does not know what setting-owned state they update.
    const extensionResults = notifyConsumableApplied(item, notificationCtx());

    debugLog('consumable.apply.result', {
      timedResult,
      addictionResult,
      diseaseRiskResult,
      extensionResults,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      vitalChangeResultFields,
    });

    return {
      timedResult: { ...timedResult, expired: normalizedCurrent.expired },
      addictionResult,
      diseaseRiskResult,
      extensionResults,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      diseaseTreatment,
      ...vitalChangeResultFields,
    };
  };

  /**
   * Родовой мост времени и эффектов: продвигает таймеры временных эффектов
   * на N игровых часов (N × 12 сцен). Используется расширениями сеттингов
   * (например, операции сна/отдыха, реализованные модулем сеттинга).
   * Возвращает { effects, expired }.
   */
  const advanceEffectsByGameHours = (hours) => {
    const store = get();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));
    const { effects: nextEffects, expired } = advanceEffectsByScenes(
      normalizedCurrent.effects,
      // Патч 262: дробные часы (10 минут работы = 1/6 ч) в float дают
      // 1.9999999999999998 сцен и домен бросает на нецелом — округляем
      // до ближайшей сцены (целые часы сна считаются точно как раньше).
      Math.round(hours * SCENE_RULES.SCENES_PER_GAME_HOUR),
    );
    syncTimedEffectsToStore(nextEffects, store);
    return { effects: nextEffects, expired: [...normalizedCurrent.expired, ...expired] };
  };

  return {
    applyConsumableFull,
    applyDiseaseExposureEvent,
    reducePersistentDiseaseRanks,
    resistDisease,
    advanceEffectsByGameHours,
  };
};
