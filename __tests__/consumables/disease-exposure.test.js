import { describe, expect, it, vi } from 'vitest';
import diseaseExposureRule from '../../modules/fallout/data/rules/diseaseExposure.json';
import moduleFood from '../../modules/fallout/data/consumables/food.json';
import moduleDrinks from '../../modules/fallout/data/consumables/drinks.json';
import { getDiseasesCatalog } from '../../i18n/conditionsCatalog';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { resolveItem } from '../../domain/resolveItem';
import { hasDamageImmunity } from '../../domain/immunities';
import { getSceneRiskRules } from '../../domain/registry';
import {
  createSceneRiskState,
  getSceneRiskEventForRule,
  resolveSceneRiskEvent,
} from '../../domain/sceneRiskChecks';
import {
  addPersistentDiseaseEffect,
  removePersistentDiseaseEffects,
  rollDiseaseFromCatalog,
} from '../../domain/diseaseConditions';
import { legacyEffectToStore, storeEffectToLegacy } from '../../src/store/effectsSync';
import { denormalizeEffects, normalizeEffects } from '../../src/store/migrations';

const roller = (values) => {
  const queue = [...values];
  return vi.fn(() => {
    if (queue.length === 0) throw new Error('test roller exhausted');
    return queue.shift();
  });
};

const check = ({
  state = createSceneRiskState(),
  eventId = 'rawFood',
  rolls = [1, 2],
  now = 1_000,
  attributeValue = 6,
  skillValue = 3,
  isTagged = true,
} = {}) => resolveSceneRiskEvent({
  rule: diseaseExposureRule,
  state,
  eventId,
  attributeValue,
  skillValue,
  isTagged,
  now,
  rollD20: roller(rolls),
});

describe('Fallout disease-exposure data', () => {
  it('declares the END + SURVIVAL 2d20 rule through the setting registry', () => {
    expect(getSceneRiskRules()).toEqual([diseaseExposureRule]);
    expect(diseaseExposureRule).toEqual({
      id: 'diseaseExposure',
      sceneDurationMinutes: 5,
      maxDifficulty: 5,
      immunity: 'disease',
      test: { attribute: 'END', skill: 'SURVIVAL' },
      roll: { rollType: 'rollD20', rollValue: 2 },
      complication: { subsequentDifficultyModifier: 1 },
      resultTable: 'diseases',
    });
  });

  it('marks all 29 raw foods explicitly and does not infer risk from text or ids', () => {
    const raw = moduleFood.filter((item) => item.state === 'raw');
    const cooked = moduleFood.filter((item) => item.state === 'cooked');

    expect(raw).toHaveLength(29);
    expect(raw.every((item) => item.sceneRiskEvents?.some((event) => (
      event.ruleId === diseaseExposureRule.id && event.eventId === 'rawFood'
    )))).toBe(true);
    expect(cooked).toHaveLength(46);
    expect(cooked.every((item) => item.sceneRiskEvents === undefined)).toBe(true);
  });

  it('marks only dirty water among drinks', () => {
    const marked = moduleDrinks.filter((item) => item.sceneRiskEvents !== undefined);
    expect(marked).toEqual([
      expect.objectContaining({
        id: 'drink_dirty_water',
        sceneRiskEvents: [{ ruleId: 'diseaseExposure', eventId: 'dirtyWater' }],
      }),
    ]);
  });

  it('carries setting metadata through catalog enrichment without inventory-instance fields', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const resolved = resolveItem({
      id: 'food_bloodbug_meat',
      itemType: 'food',
      quantity: 1,
    }, catalog);

    expect(resolved.sceneRiskEvents).toEqual([
      { ruleId: 'diseaseExposure', eventId: 'rawFood' },
    ]);
  });
});

describe('universal scene risk checks', () => {
  it('implements the owner example: a single 20 adds difficulty for later checks in the same scene', () => {
    const rawFood = check({ rolls: [5, 20], now: 1_000 });
    expect(rawFood.check).toMatchObject({
      baseDifficulty: 1,
      difficulty: 1,
      targetNumber: 9,
      successes: 1,
      complicationCount: 1,
      addedDifficulty: 1,
      passed: true,
    });
    expect(rawFood.state.difficultyModifier).toBe(1);

    const dirtyWater = check({
      state: rawFood.state,
      eventId: 'dirtyWater',
      rolls: [2, 8],
      now: 2_000,
    });
    expect(dirtyWater.check).toMatchObject({
      baseDifficulty: 2,
      difficulty: 3,
      successes: 3,
      passed: true,
    });
    expect(dirtyWater.state.difficultyModifier).toBe(1);

    const sleepOnGround = check({
      state: dirtyWater.state,
      eventId: 'sleepOnGround',
      rolls: [2, 3],
      now: 3_000,
    });
    expect(sleepOnGround.check).toMatchObject({
      baseDifficulty: 3,
      difficulty: 4,
      successes: 4,
      passed: true,
    });
  });

  it('applies the same subsequent-check complication to dirty water', () => {
    const dirtyWater = check({
      eventId: 'dirtyWater',
      rolls: [5, 20],
    });
    expect(dirtyWater.check).toMatchObject({
      eventId: 'dirtyWater',
      difficulty: 1,
      complicationCount: 1,
      addedDifficulty: 1,
      passed: true,
      outcome: 'successWithComplication',
    });
    expect(dirtyWater.state.difficultyModifier).toBe(1);
  });

  it('ignores a repeated event type during the same five-minute scene', () => {
    const first = check({ rolls: [1, 2], now: 10_000 });
    const repeatRoll = roller([20, 20]);
    const repeated = resolveSceneRiskEvent({
      rule: diseaseExposureRule,
      state: first.state,
      eventId: 'rawFood',
      attributeValue: 6,
      skillValue: 3,
      isTagged: true,
      now: 20_000,
      rollD20: repeatRoll,
    });

    expect(repeated.status).toBe('duplicate');
    expect(repeated.check).toBeNull();
    expect(repeated.state).toBe(first.state);
    expect(repeatRoll).not.toHaveBeenCalled();
  });

  it('starts a clean scene at the five-minute boundary', () => {
    const first = check({ rolls: [5, 20], now: 10_000 });
    const nextScene = check({
      state: first.state,
      eventId: 'dirtyWater',
      rolls: [5, 6],
      now: 10_000 + (5 * 60 * 1000),
    });

    expect(nextScene.check).toMatchObject({ baseDifficulty: 1, difficulty: 1 });
    expect(nextScene.state.eventIds).toEqual(['dirtyWater']);
    expect(nextScene.state.difficultyModifier).toBe(0);
  });

  it('makes two natural 20s an automatic failure and adds +2 for later checks', () => {
    const result = check({ rolls: [20, 20] });
    expect(result.check).toMatchObject({
      complicationCount: 2,
      addedDifficulty: 2,
      automaticFailure: true,
      passed: false,
    });
    expect(result.state.difficultyModifier).toBe(2);
  });

  it('caps total difficulty at five', () => {
    const state = {
      sceneStartedAt: 1_000,
      eventIds: ['rawFood', 'dirtyWater', 'sleepOnGround', 'otherRisk'],
      difficultyModifier: 2,
    };
    const result = check({
      state,
      eventId: 'fifthRisk',
      rolls: [1, 1],
      now: 2_000,
    });
    expect(result.check.baseDifficulty).toBe(5);
    expect(result.check.difficulty).toBe(5);
  });

  it('reads only explicit sceneRiskEvents metadata', () => {
    expect(getSceneRiskEventForRule(
      { id: 'food_raw-looking_name', state: 'raw' },
      diseaseExposureRule.id,
    )).toBeNull();
    expect(getSceneRiskEventForRule(
      { sceneRiskEvents: [{ ruleId: 'diseaseExposure', eventId: 'rawFood' }] },
      diseaseExposureRule.id,
    )).toEqual({ ruleId: 'diseaseExposure', eventId: 'rawFood' });
  });
});

describe('disease assignment and display-only effects', () => {
  it('reads the setting-declared immunity from explicit character immunity data', () => {
    expect(hasDamageImmunity(
      { trait: { modifiers: { immunities: ['disease'] } } },
      diseaseExposureRule.immunity,
    )).toBe(true);
    expect(hasDamageImmunity(
      { trait: { modifiers: { immunities: ['radiation'] } } },
      diseaseExposureRule.immunity,
    )).toBe(false);
  });

  it('uses the localized d20 catalog and creates a permanent descriptive effect', () => {
    const catalog = getDiseasesCatalog('ru-RU');
    const result = rollDiseaseFromCatalog(catalog, () => 4);
    expect(result.roll).toBe(4);
    expect(result.disease.id).toBe('disease_dysentery');

    const applied = addPersistentDiseaseEffect([], result.disease, 1234);
    expect(applied.added).toBe(true);
    expect(applied.effect).toMatchObject({
      id: 'condition-disease_dysentery',
      effectName: 'Дизентерия',
      effectLabel: 'Время на каждой ступени шкалы жажды уменьшается вдвое.',
      effectKind: 'negative',
      effectType: 'disease',
      conditionId: 'disease_dysentery',
      isPermanent: true,
      scenesLeft: 0,
      createdAt: 1234,
    });
  });

  it('does not duplicate the same disease, allows another disease, and antibiotics can clear all', () => {
    const catalog = getDiseasesCatalog('en-EN');
    const firstDisease = rollDiseaseFromCatalog(catalog, () => 1).disease;
    const secondDisease = rollDiseaseFromCatalog(catalog, () => 2).disease;
    const first = addPersistentDiseaseEffect([], firstDisease, 100);
    const duplicate = addPersistentDiseaseEffect(first.effects, firstDisease, 200);
    const second = addPersistentDiseaseEffect(duplicate.effects, secondDisease, 300);

    expect(duplicate.added).toBe(false);
    expect(second.effects).toHaveLength(2);
    const cleared = removePersistentDiseaseEffects(second.effects);
    expect(cleared.removed).toHaveLength(2);
    expect(cleared.effects).toEqual([]);
  });

  it('preserves disease identity through both normalized effect-store bridges', () => {
    const disease = getDiseasesCatalog('en-EN')[0];
    const effect = addPersistentDiseaseEffect([], disease, 100).effect;
    const expected = {
      effectType: 'disease',
      conditionId: disease.id,
      effectName: disease.name,
      effectLabel: disease.effectLabel,
      isPermanent: true,
    };

    expect(storeEffectToLegacy(legacyEffectToStore(effect))).toMatchObject(expected);
    expect(denormalizeEffects(normalizeEffects([effect]))[0]).toMatchObject(expected);
  });
});
