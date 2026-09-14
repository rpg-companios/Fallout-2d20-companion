// src/store/orchestratorsSlice.js
//
// Оркестраторы персонажа — Шаг 8а (патч 240): «выпить расходник» (полный
// конвейер), семейство болезней (заражение/лечение/сопротивление) и мост
// времени эффектов. Переехали из CharacterContext 1-в-1; источники данных —
// состояние стора (радиация/здоровье/условия/журнал доз/эффекты/профиль),
// записи — через экшены того же стора. React-контекст больше не участвует.
//
// Сеттинговые уведомления (notifyConditionEvent / notifyConsumableApplied)
// получают ctx = { stateExtensions, setStateExtension } прямо из стора —
// реестр расширений ничего не знает о React.
//
// Правила игры живут в домене (domain/effects.js, domain/diseaseConditions.js,
// domain/sceneRiskChecks.js); слайс только собирает шаги в конвейер.

import { debugLog } from '../debug/falloutDebug.js';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from './effectsSync.js';
import { selectLegacyAttributes, selectLegacySkills } from './selectors.js';
import {
  applyConsumableToEffects,
  recordDoseWithinWindow,
  checkAddiction,
  applyRemoveConditions,
  advanceEffectsByScenes,
  pruneExpiredTimedEffects,
  resolveConsumableVitalChanges,
  SCENE_RULES,
} from '../../domain/effects';
import { hasDamageImmunity, hasRadiationImmunity } from '../../domain/immunities';
import {
  addPersistentDiseaseEffect,
  removePersistentDiseaseEffects,
  reduceDiseaseRanks,
  increaseDiseaseRank,
  effectDiseaseRank,
  resistDiseaseRoll,
  rollDiseaseFromCatalog,
  DISEASE_RESIST_COOLDOWN_MS,
} from '../../domain/diseaseConditions';
import { createSceneRiskTracker, getSceneRiskEventForRule } from '../../domain/sceneRiskChecks';
import { isSkillTagged } from '../../domain/d20Checks';
import { getConditionCatalog, getSceneRiskRules } from '../../domain/registry';
import { calculateMaxHealth, getAttributeValue } from '../../domain/characterCreation';
import { getCurrentModuleLocale } from '../../i18n/locale';
import { notifyConditionEvent, notifyConsumableApplied } from './stateExtensions';

export const CHEM_DOSE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ANTIBIOTIC_CHEM_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DISEASE_ATTRIBUTE = 'END';
export const DISEASE_SKILL = 'SURVIVAL';

/**
 * @param {function} set - zustand set
 * @param {function} get - zustand get
 */
export const createOrchestrationActions = (set, get) => {
  const notificationCtx = () => ({
    stateExtensions: get().stateExtensions,
    setStateExtension: get().setStateExtension,
  });

  /** Журнал доз препаратов: добавить дозу, вернуть размер пула за 24 ч. */
  const recordChemDose = (chemId) => {
    const now = Date.now();
    const result = recordDoseWithinWindow(
      get().chemDosesLog,
      { chemId, takenAt: now },
      { now, windowMs: CHEM_DOSE_WINDOW_MS },
    );
    set({ chemDosesLog: result.doseLog });
    return result.doseCount;
  };

  /**
   * Проверка риска заражения (§7 дока): единая механика для событий сцен
   * (sleepOnGround) и расходников (rawFood / dirtyWater). Бросок по правилу
   * из реестра; при провале — болезнь из каталога (иммунитет ориджина/трейта
   * отменяет заражение), перманентный эффект + условие 'diseased' + уведомление
   * сеттинга (усталость источника «болезнь»).
   */
  const applyDiseaseExposureEvent = (eventId) => {
    const state = get();
    const ruleMatches = getSceneRiskRules()
      .map((rule) => ({
        rule,
        event: Array.isArray(rule.eventTypes) && rule.eventTypes.includes(eventId)
          ? { eventId }
          : null,
      }))
      .filter(({ event }) => event !== null);
    if (ruleMatches.length === 0) return null;
    if (ruleMatches.length > 1) {
      throw new Error(`[characterStore] Событие риска "${eventId}" объявлено несколькими правилами`);
    }

    const { rule, event } = ruleMatches[0];
    if (rule.resultTable !== 'diseases') {
      throw new Error(`[characterStore] Неизвестная таблица результата проверки риска: ${rule.resultTable}`);
    }

    const legacyAttributes = selectLegacyAttributes({ attributes: state.attributes });
    const legacySkills = selectLegacySkills({ skills: state.skills });
    const attribute = legacyAttributes.find((entry) => entry?.name === rule.test.attribute);
    const skill = legacySkills.find((entry) => entry?.name === rule.test.skill);
    if (!attribute || !skill) {
      throw new Error(
        `[characterStore] Для проверки ${rule.id} отсутствует `
        + `${rule.test.attribute} или ${rule.test.skill}`,
      );
    }

    // Трекер создаётся на вызов из текущих состояний проверок — состояние
    // единственное, в сторе (раньше жил в ref провайдера).
    const tracker = createSceneRiskTracker(state.sceneRiskStates || {});
    const { result: riskResult, states: nextStates } = tracker.resolveEvent({
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

    if (riskResult.status === 'duplicate') return riskResult;

    get().setSceneRiskStates(nextStates);

    if (riskResult.check.passed) {
      return { ...riskResult, diseaseRoll: null, disease: null, infectionStatus: null };
    }

    const { roll: diseaseRoll, disease } = rollDiseaseFromCatalog(
      getConditionCatalog('disease', getCurrentModuleLocale()),
    );
    if (hasDamageImmunity({ origin: state.origin, trait: state.trait }, rule.immunity)) {
      return { ...riskResult, diseaseRoll, disease, infectionStatus: 'immune' };
    }

    const store = get();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(store.effects)).effects;
    const applied = addPersistentDiseaseEffect(currentEffects, disease);
    if (applied.added) {
      syncTimedEffectsToStore(applied.effects, store);
    }
    set((s) => ({
      conditions: s.conditions.includes('diseased') ? s.conditions : [...s.conditions, 'diseased'],
    }));

    if (applied.added) {
      // Усталость от болезни (патч 215): +1 источник «болезнь». Движок
      // уведомляет сеттинг — модуль Fallout двигает усталость.
      notifyConditionEventIn(
        { kind: 'disease', event: 'infected', conditionId: disease.id },
      );
    }

    return {
      ...riskResult,
      diseaseRoll,
      disease,
      infectionStatus: applied.added ? 'infected' : 'duplicate',
    };
  };

  /** notifyConditionEvent c ctx из стора (stateExtensions импортов не имеет — цикла нет). */
  const notifyConditionEventIn = (event) => notifyConditionEvent(event, notificationCtx());

  /**
   * Лечение болезней (патч 215): снимает `amount` единиц с КАЖДОЙ активной
   * болезни (антибиотик — 1 за раз, отдых в постели — по порциям сна).
   * Излеченные болезни удаляются из эффектов; сеттинг уведомляется о каждой
   * (снимает усталость источника «болезнь»). Условие 'diseased' остаётся,
   * пока есть хотя бы одна болезнь.
   * @returns {{ healed: string[], diseasesLeft: number }}
   */
  const reducePersistentDiseaseRanks = (amount) => {
    const storeNow = get();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(storeNow.effects)).effects;
    const treated = reduceDiseaseRanks(currentEffects, amount);
    syncTimedEffectsToStore(treated.effects, storeNow);
    for (const conditionId of treated.healed) {
      notifyConditionEventIn({ kind: 'disease', event: 'cured', conditionId });
    }
    const diseasesLeft = treated.effects.filter((e) => e.effectType === 'disease').length;
    if (diseasesLeft === 0 && storeNow.conditions.includes('diseased')) {
      set((s) => ({ conditions: s.conditions.filter((c) => c !== 'diseased') }));
    }
    return { healed: treated.healed, diseasesLeft };
  };

  /**
   * Проверка «Сопротивляться» болезни (патч 215): 2d20, успех грани —
   * <= ВЫН + Выживание (1 на грани — 2 успеха; отмеченный «Выживание»
   * и грань <= его ранга — 2 успеха). Сумма успехов >= ранга болезни
   * излечивает её; каждая грань 20 повышает ранг на 1. Одна попытка в сутки.
   */
  const resistDisease = (conditionId) => {
    const now = Date.now();
    const state = get();
    if (state.lastDiseaseResistAt != null && now - state.lastDiseaseResistAt < DISEASE_RESIST_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        retryInMs: DISEASE_RESIST_COOLDOWN_MS - (now - state.lastDiseaseResistAt),
      };
    }
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(state.effects)).effects;
    const effect = currentEffects.find((e) => e.effectType === 'disease' && e.conditionId === conditionId);
    if (!effect) return { ok: false, reason: 'notFound' };

    const legacyAttributes = selectLegacyAttributes({ attributes: state.attributes });
    const legacySkills = selectLegacySkills({ skills: state.skills });
    const attribute = legacyAttributes.find((entry) => entry?.name === DISEASE_ATTRIBUTE);
    const skill = legacySkills.find((entry) => entry?.name === DISEASE_SKILL);
    if (!attribute || !skill) {
      throw new Error(`[characterStore] Для сопротивления болезни отсутствует ${DISEASE_ATTRIBUTE} или ${DISEASE_SKILL}`);
    }
    const isTagged = isSkillTagged({
      skillId: DISEASE_SKILL,
      primaryTaggedSkillIds: state.selectedSkills,
      extraTaggedSkillIds: state.extraTaggedSkills,
    });

    const rankBefore = effectDiseaseRank(effect);
    const roll = resistDiseaseRoll({
      targetNumber: getAttributeValue(legacyAttributes, DISEASE_ATTRIBUTE) + skill.value,
      taggedSurvivalRank: isTagged ? skill.value : null,
      diseaseRank: rankBefore,
    });

    get().setLastDiseaseResistAt(now);

    let rankAfter = rankBefore;
    if (roll.cured) {
      const withoutDisease = currentEffects.filter((e) => e !== effect);
      syncTimedEffectsToStore(withoutDisease, get());
      notifyConditionEventIn({ kind: 'disease', event: 'cured', conditionId });
      if (!withoutDisease.some((e) => e.effectType === 'disease') && get().conditions.includes('diseased')) {
        set((s) => ({ conditions: s.conditions.filter((c) => c !== 'diseased') }));
      }
    } else if (roll.rankIncrease > 0) {
      rankAfter = rankBefore + roll.rankIncrease;
      const withRank = increaseDiseaseRank(currentEffects, conditionId, roll.rankIncrease);
      syncTimedEffectsToStore(withRank, get());
    }

    return {
      ok: true,
      diseaseName: effect.effectName,
      ...roll,
      rankBefore,
      rankAfter,
    };
  };

  /** Риск заражения расходником (грязная вода/сырая еда); перк-иммунитет учитывается. */
  const applyDiseaseExposureForConsumable = (item) => {
    if (
      item?.id === 'drink_dirty_water'
      && Boolean(get().perkBonuses?.dirtyWaterDiseaseImmune)
    ) {
      return null;
    }
    const ruleMatches = getSceneRiskRules()
      .map((rule) => ({ rule, event: getSceneRiskEventForRule(item, rule.id) }))
      .filter(({ event }) => event !== null);
    if (ruleMatches.length === 0) return null;
    if (ruleMatches.length > 1) {
      throw new Error('[characterStore] Расходник объявляет несколько проверок риска одной сцены');
    }

    // Единая механика проверки болезни (§7 дока): событие расходника
    // разрешается тем же кодом, что и sleepOnGround.
    return applyDiseaseExposureEvent(ruleMatches[0].event.eventId);
  };

  /**
   * Применяет расходник: мгновенное лечение/радиация, timed-эффекты,
   * removeCondition, проверку зависимости и явно объявленный риск заражения.
   */
  const applyConsumableFull = (item, options = {}) => {
    debugLog('consumable.apply.start', {
      itemName: item?.name || item?.Name,
      itemId: item?.id || item?.code,
      positiveEffect: item?.positiveEffect,
      positiveEffectType: typeof item?.positiveEffect,
    });

    // 1. Мгновенные показатели: сначала лечение, затем радиация.
    const state = get();
    const {
      hpHealBonus = 0,
      irradiatedConsumableRadiationImmune = false,
      colaNutDrinkIds,
      colaNutHealMultiplier = 1,
    } = state.perkBonuses || {};
    const hpHealMultiplier = Array.isArray(colaNutDrinkIds) && colaNutDrinkIds.includes(item?.id)
      ? Number(colaNutHealMultiplier) || 1
      : 1;
    const vitalOptions = {
      currentHealth: state.currentHealth,
      maxHealth: calculateMaxHealth(
        selectLegacyAttributes({ attributes: state.attributes }),
        state.level,
      ),
      radiation: state.radiation,
      hpHealBonus,
      hpHealMultiplier,
      radiationImmune: hasRadiationImmunity({ origin: state.origin, trait: state.trait }),
      skipIrradiatedRadiation: Boolean(irradiatedConsumableRadiationImmune),
    };
    if (Object.hasOwn(options, 'radiationRequestedAmount')) {
      vitalOptions.radiationRequestedAmount = options.radiationRequestedAmount;
    }
    const vitalChanges = resolveConsumableVitalChanges(item, vitalOptions);
    if (vitalChanges.healAmount > 0) {
      get().setCurrentHealth(vitalChanges.healthAfter);
    }
    if (vitalChanges.radiationAmount !== null) {
      // Радиация расходника напрямую меняет счётчик: DR частей тела не участвует.
      get().setRadiation(vitalChanges.radiationAfter);
    }

    // 2. Timed-эффекты через стор.
    const store = get();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

    const timedResult = applyConsumableToEffects(item, normalizedCurrent.effects);
    const normalizedResult = pruneExpiredTimedEffects(timedResult.effects);
    syncTimedEffectsToStore(normalizedResult.effects, store);

    // 3. removeCondition (аддиктол, антибиотики)
    const {
      conditions: nextConditions,
      removed: removedRaw,
      requested: conditionRemovalsRequested,
    } = applyRemoveConditions(item, state.conditions);
    let removed = removedRaw;
    // Лечение болезней (патч 215): антибиотик снимает 1 единицу с КАЖДОЙ
    // болезни (ранги), а не лечит всё разом; не более 1 дозы в 24 часа.
    let diseaseTreatment = null;
    const antibioticRequested = conditionRemovalsRequested.includes('diseased') && item?.antibiotic === true;
    if (antibioticRequested && removedRaw.includes('diseased')) {
      const lastAntibioticDose = state.chemDosesLog
        .filter((d) => d.chemId === item.id)
        .map((d) => d.takenAt)
        .sort((a, b) => b - a)[0];
      const onCooldown = lastAntibioticDose != null && Date.now() - lastAntibioticDose < ANTIBIOTIC_CHEM_WINDOW_MS;
      if (onCooldown) {
        diseaseTreatment = { blocked: true };
        removed = removedRaw.filter((c) => c !== 'diseased');
      } else {
        const treatment = reducePersistentDiseaseRanks(1);
        diseaseTreatment = { blocked: false, ...treatment };
        removed = treatment.diseasesLeft === 0 ? removedRaw : removedRaw.filter((c) => c !== 'diseased');
      }
      // Условие 'diseased' пересчитывается в reducePersistentDiseaseRanks
      // (снимается только при полном излечении); nextConditions без него
      // при частичном лечении не применяем.
      set({ conditions: nextConditions });
    } else if (removedRaw.length > 0) {
      set({ conditions: nextConditions });
      // Снятие зависимости (аддиктол): удаляем перманентный эффект
      // «Зависимость: Стелс-бой» из активных эффектов.
      if (removedRaw.includes('addicted')) {
        const storeNow = get();
        const currentEffects = effectsDictToLegacyArray(storeNow.effects);
        const withoutAddiction = currentEffects.filter(
          (effect) => !(effect.isPermanent && String(effect.effectName || '').includes('Зависимость')),
        );
        syncTimedEffectsToStore(withoutAddiction, storeNow);
      }
      if (removedRaw.includes('diseased')) {
        // Не-антибиотик, снимающий болезни целиком (историческое поведение):
        // удаляем все болезненные эффекты и уведомляем сеттинг о каждой
        // излеченной болезни (усталость источника «болезнь» снимается).
        const storeNow = get();
        const currentEffects = effectsDictToLegacyArray(storeNow.effects);
        const withoutDiseases = removePersistentDiseaseEffects(currentEffects);
        syncTimedEffectsToStore(withoutDiseases.effects, storeNow);
        for (const cured of withoutDiseases.removed) {
          notifyConditionEventIn(
            { kind: 'disease', event: 'cured', conditionId: cured.conditionId },
          );
        }
      }
    }

    // 4. Зависимость. Каждая химическая доза входит в общий пул за 24 часа,
    // даже если у текущего препарата нет свойства зависимости.
    const dosesToday = item?.itemType === 'chem'
      ? recordChemDose(item.id)
      : 0;

    // partyBoy: невосприимчив к алко-зависимости (item.isAlcohol === true)
    const hasPartyBoyImmunity =
      item?.isAlcohol === true &&
      Boolean(state.perkBonuses.alcoholAddictionImmune);
    const isChemItem = item?.itemType === 'chem' || item?.itemType === 'chems';
    const hasChemAddictionImmunity = isChemItem && Boolean(state.perkBonuses.chemAddictionImmune);

    let addictionResult = null;
    // Стелс-бой: зависимость возможна ТОЛЬКО у Тени (решение владельца).
    // У остальных ориджинов применения Стелс-боя не дают зависимости
    // (ни броска, ни негативного эффекта).
    const isShadowCharacter = state.origin?.id === 'shadow' || state.trait?.id === 'shadow';
    const isStealthBoy = item?.id === 'chem_stealth_boy' || item?.id === 'stealth_boy';
    if (
      item?.addictionLevel > 0 &&
      item?.negativeEffect === 'addiction' &&
      !hasPartyBoyImmunity &&
      !hasChemAddictionImmunity &&
      (!isStealthBoy || isShadowCharacter)
    ) {
      // Тень: зависимость при ЛЮБОМ эффекте на боевом кубике
      // (бросок CD, грани 5/6 = эффект).
      const anyEffect = isShadowCharacter && isStealthBoy;
      addictionResult = checkAddiction(item, dosesToday, {
        anyEffect,
        dicePenalty: isChemItem ? (Number(state.perkBonuses.chemAddictionDicePenalty) || 0) : 0,
      });
      if (addictionResult.addicted && !state.conditions.includes('addicted')) {
        set((s) => ({ conditions: [...s.conditions, 'addicted'] }));
        // Перманентный эффект зависимости: отображается в карточке эффектов,
        // не истекает по сценам; снимается аддиктолом (removeCondition).
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
          const store2 = get();
          syncTimedEffectsToStore([...normalizedResult.effects, addictionEffect], store2);
        }
      }
    }

    const diseaseRiskResult = applyDiseaseExposureForConsumable(item);

    // Расходник применён на себя — уведомляем расширения сеттингов
    // (реестр stateExtensions, патч 208). Например, Fallout двигает
    // шкалы еды/воды выживания при употреблении еды/напитков ЛЮБЫМ путём
    // (инвентарь или модалка выживания). Движок правил не знает.
    const extensionResults = notifyConsumableApplied(item, notificationCtx());

    debugLog('consumable.apply.result', {
      timedResult,
      addictionResult,
      diseaseRiskResult,
      extensionResults,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      healAmount: vitalChanges.healAmount,
      radiationAmount: vitalChanges.radiationAmount,
    });

    return {
      timedResult: { ...timedResult, expired: normalizedCurrent.expired },
      addictionResult,
      diseaseRiskResult,
      extensionResults,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      diseaseTreatment,
      healAmount: vitalChanges.healAmount,
      radiationAmount: vitalChanges.radiationAmount,
    };
  };

  /**
   * Родовой мост времени и эффектов: продвигает таймеры временных эффектов
   * на N игровых часов (N × 12 сцен). Используется расширениями сеттингов
   * (например, сон выживания Fallout: docs/survival-system-design.md §5).
   * Возвращает { effects, expired }.
   */
  const advanceEffectsByGameHours = (hours) => {
    const store = get();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));
    const { effects: nextEffects, expired } = advanceEffectsByScenes(
      normalizedCurrent.effects,
      hours * SCENE_RULES.SCENES_PER_GAME_HOUR,
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
