import { rollDie } from './diceRollsLogic';

const assertDiseaseCatalog = (catalog) => {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error('[diseaseConditions] Disease catalog must be a non-empty array');
  }
  const rolls = new Set();
  const ids = new Set();
  for (const disease of catalog) {
    if (
      !disease
      || typeof disease.id !== 'string'
      || !disease.id
      || typeof disease.name !== 'string'
      || !disease.name
      || typeof disease.effectLabel !== 'string'
      || !disease.effectLabel
      || !Number.isInteger(disease.d20Roll)
      || disease.d20Roll < 1
      || disease.d20Roll > 20
    ) {
      throw new Error('[diseaseConditions] Invalid disease catalog entry');
    }
    if (rolls.has(disease.d20Roll) || ids.has(disease.id)) {
      throw new Error('[diseaseConditions] Disease ids and d20Roll values must be unique');
    }
    rolls.add(disease.d20Roll);
    ids.add(disease.id);
  }
};

export const rollDiseaseFromCatalog = (catalog, rollD20 = () => rollDie(20)) => {
  assertDiseaseCatalog(catalog);
  if (typeof rollD20 !== 'function') {
    throw new Error('[diseaseConditions] d20 roller must be a function');
  }
  const roll = rollD20();
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new Error('[diseaseConditions] d20 roller returned a value outside 1..20');
  }
  const disease = catalog.find((entry) => entry.d20Roll === roll);
  if (!disease) {
    throw new Error(`[diseaseConditions] Disease table has no result for d20 roll ${roll}`);
  }
  return { roll, disease };
};

export const createPersistentDiseaseEffect = (disease, now = Date.now()) => {
  assertDiseaseCatalog([disease]);
  if (!Number.isFinite(now) || now < 0) {
    throw new Error('[diseaseConditions] Invalid effect timestamp');
  }
  return {
    id: `condition-${disease.id}`,
    effectName: disease.name,
    effectLabel: disease.effectLabel,
    effectKind: 'negative',
    effectType: 'disease',
    conditionId: disease.id,
    sourceName: disease.name,
    createdAt: now,
    isPermanent: true,
    scenesLeft: 0,
  };
};

export const addPersistentDiseaseEffect = (currentEffects, disease, now = Date.now()) => {
  if (!Array.isArray(currentEffects)) {
    throw new Error('[diseaseConditions] Active effects must be an array');
  }
  const existing = currentEffects.find((effect) => (
    effect?.effectType === 'disease' && effect.conditionId === disease.id
  ));
  if (existing) {
    return { effects: currentEffects, effect: existing, added: false };
  }
  const effect = createPersistentDiseaseEffect(disease, now);
  return { effects: [...currentEffects, effect], effect, added: true };
};

export const removePersistentDiseaseEffects = (currentEffects) => {
  if (!Array.isArray(currentEffects)) {
    throw new Error('[diseaseConditions] Active effects must be an array');
  }
  const effects = currentEffects.filter((effect) => effect?.effectType !== 'disease');
  return {
    effects,
    removed: currentEffects.filter((effect) => effect?.effectType === 'disease'),
  };
};
