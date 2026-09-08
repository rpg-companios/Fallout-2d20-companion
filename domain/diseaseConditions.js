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
    rank: diseaseRankFromCatalog(disease),
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

// ---------------------------------------------------------------------------
// Ранги болезней (патч 215)
// ---------------------------------------------------------------------------
//
// Каждая болезнь имеет ранг (в данных — duration, 1/3/4). Ранг — текущая
// сложность сопротивления и число «единиц» болезни, которые нужно снять
// лечением (антибиотик −1 с каждой болезни, отдых в постели) или одной
// успешной проверкой «Сопротивляться». Ранг живёт на эффекте болезни
// (поле rank) и растёт на каждой 20-ке в броске сопротивления.
//
// Усталость от болезни — отдельный источник ('disease') состояния
// выживания: +1 при заражении, −1 при полном излечении болезни
// (modules/fallout/survival/survival.ts, патч 215).

export const DEFAULT_DISEASE_RANK = 1;

// Одна попытка «Сопротивляться» в сутки (решение владельца, патч 215).
export const DISEASE_RESIST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Ранг болезни из данных (duration); невалидный — ошибка данных. */
export const diseaseRankFromCatalog = (disease) => {
  const rank = Number(disease?.duration);
  if (!Number.isInteger(rank) || rank < 1) {
    throw new Error(`[diseaseConditions] Для болезни "${disease?.id}" нет валидного ранга (duration)`);
  }
  return rank;
};

/** Ранг на эффекте болезни: поле rank; эффект без поля — ранг 1 (миграция v25). */
export const effectDiseaseRank = (effect) => {
  const rank = Number(effect?.rank);
  return Number.isInteger(rank) && rank >= 1 ? rank : DEFAULT_DISEASE_RANK;
};

/**
 * Снимает `amount` единиц с КАЖДОЙ болезни. Болезнь, чей ранг стал 0,
 * вылечена: эффект удаляется, её id попадает в healed. Не мутирует эффекты.
 * @returns {{ effects: object[], healed: string[] }}
 */
export const reduceDiseaseRanks = (currentEffects, amount = 1) => {
  if (!Array.isArray(currentEffects)) {
    throw new Error('[diseaseConditions] Active effects must be an array');
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('[diseaseConditions] reduceDiseaseRanks: amount должен быть целым >= 0');
  }
  const healed = [];
  const effects = [];
  for (const effect of currentEffects) {
    if (effect?.effectType !== 'disease') {
      effects.push(effect);
      continue;
    }
    const rank = effectDiseaseRank(effect) - amount;
    if (rank <= 0) {
      healed.push(effect.conditionId);
      continue;
    }
    effects.push({ ...effect, rank });
  }
  return { effects, healed };
};

/**
 * Увеличивает ранг конкретной болезни (20-ка в броске сопротивления,
 * патч 215). Не мутирует эффекты.
 * @returns {object[]} новый массив эффектов
 */
export const increaseDiseaseRank = (currentEffects, conditionId, amount = 1) => {
  if (!Array.isArray(currentEffects)) {
    throw new Error('[diseaseConditions] Active effects must be an array');
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('[diseaseConditions] increaseDiseaseRank: amount должен быть целым >= 0');
  }
  return currentEffects.map((effect) => (
    effect?.effectType === 'disease' && effect.conditionId === conditionId
      ? { ...effect, rank: effectDiseaseRank(effect) + amount }
      : effect
  ));
};

/**
 * Одна проверка «Сопротивляться» болезни (чистая, патч 215).
 *
 * Бросок 2d20. Для каждой грани:
 *   - грань 1 — 2 успеха;
 *   - грань <= targetNumber (ВЫН + Выживание) — 1 успех; если навык
 *     «Выживание» отмечен (tagged) и грань <= его ранга — 2 успеха;
 *   - иначе 0 успехов.
 * Сумма успехов >= ранга болезни — болезнь отменена (cured: true).
 * Каждая грань 20 — сложность болезни +1 (rankIncrease).
 *
 * @param {object} options
 * @param {number} options.targetNumber сумма ВЫН + Выживание
 * @param {number|null} [options.taggedSurvivalRank] ранг отмеченного навыка
 *        «Выживание» (null — навык не отмечен)
 * @param {number} [options.diseaseRank] текущий ранг болезни
 * @param {function} [options.rollD20] инъекция броска (по умолчанию rollDie(20))
 * @returns {{ rolls: number[], successes: number, targetNumber: number,
 *            cured: boolean, rankIncrease: number }}
 */
export const resistDiseaseRoll = ({
  targetNumber,
  taggedSurvivalRank = null,
  diseaseRank = DEFAULT_DISEASE_RANK,
  rollD20 = () => rollDie(20),
}) => {
  if (!Number.isInteger(targetNumber) || targetNumber < 1) {
    throw new Error('[diseaseConditions] resistDiseaseRoll: targetNumber должен быть целым >= 1');
  }
  if (!Number.isInteger(diseaseRank) || diseaseRank < 1) {
    throw new Error('[diseaseConditions] resistDiseaseRoll: diseaseRank должен быть целым >= 1');
  }
  if (typeof rollD20 !== 'function') {
    throw new Error('[diseaseConditions] resistDiseaseRoll: rollD20 должен быть функцией');
  }
  const taggedRank = taggedSurvivalRank == null ? null : Number(taggedSurvivalRank);
  if (taggedRank !== null && (!Number.isInteger(taggedRank) || taggedRank < 1)) {
    throw new Error('[diseaseConditions] resistDiseaseRoll: taggedSurvivalRank должен быть целым >= 1 или null');
  }

  const rolls = [rollD20(), rollD20()];
  for (const face of rolls) {
    if (!Number.isInteger(face) || face < 1 || face > 20) {
      throw new Error('[diseaseConditions] d20 roller returned a value outside 1..20');
    }
  }

  let successes = 0;
  let rankIncrease = 0;
  for (const face of rolls) {
    if (face === 20) {
      rankIncrease += 1;
      continue; // 20 > любой суммы ВЫН+Выживание — успеха нет
    }
    if (face === 1) {
      successes += 2;
      continue;
    }
    if (face <= targetNumber) {
      successes += (taggedRank !== null && face <= taggedRank) ? 2 : 1;
    }
  }

  return {
    rolls,
    successes,
    targetNumber,
    cured: successes >= diseaseRank,
    rankIncrease,
  };
};
