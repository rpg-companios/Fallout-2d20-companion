import { rollCombatDice, rollMultipleCombatDice } from '../logic/diceRollsLogic.js';

/** Resolve fixed or Combat Dice radiation modifiers from Fallout consumable data. */
export const resolveConsumableRadiationRoll = (item, {
  radiationImmune = false,
  skipIrradiatedRadiation = false,
} = {}) => {
  if (item?.irradiated && skipIrradiatedRadiation) {
    return { requestedAmount: null, rolls: null };
  }

  const modifier = item?.radiationModifier;
  if (modifier == null || radiationImmune) {
    return { requestedAmount: null, rolls: null };
  }

  if (
    typeof modifier !== 'object'
    || Array.isArray(modifier)
    || !['+', '-'].includes(modifier.op)
  ) {
    throw new Error('[effects] Некорректный radiationModifier расходника');
  }

  const hasFixedValue = Object.hasOwn(modifier, 'value');
  const hasRollFields = Object.hasOwn(modifier, 'rollType')
    || Object.hasOwn(modifier, 'rollValue');
  if (hasFixedValue === hasRollFields) {
    throw new Error('[effects] Некорректный radiationModifier расходника');
  }

  if (hasFixedValue) {
    if (!Number.isFinite(modifier.value) || modifier.value <= 0) {
      throw new Error('[effects] Некорректный radiationModifier расходника');
    }
    const requestedAmount = modifier.op === '+' ? modifier.value : -modifier.value;
    return { requestedAmount, rolls: null };
  }

  if (
    modifier.rollType !== 'rollCD'
    || !Number.isInteger(modifier.rollValue)
    || modifier.rollValue <= 0
  ) {
    throw new Error('[effects] Некорректный radiationModifier расходника');
  }

  const rolled = rollMultipleCombatDice(modifier.rollValue);
  const requestedAmount = modifier.op === '+' ? rolled.total : -rolled.total;
  return { requestedAmount, rolls: rolled.rolls };
};

export const resolveConsumableRadiationAmount = (item, options = {}) => (
  resolveConsumableRadiationRoll(item, options).requestedAmount
);

/** Fallout-specific preview shape retained by the engine store action. */
export const previewFalloutConsumableRadiation = ({ item, state, radiationImmune = false }) => {
  const {
    irradiatedConsumableRadiationImmune = false,
    irradiatedConsumableRadiationRerollIfDamage = 0,
  } = state?.perkBonuses || {};
  const roll = resolveConsumableRadiationRoll(item, {
    radiationImmune,
    skipIrradiatedRadiation: Boolean(irradiatedConsumableRadiationImmune),
  });
  const receivedRadiationDamage = roll.requestedAmount == null
    ? 0
    : Math.max(0, state.radiation + roll.requestedAmount) - state.radiation;

  return {
    requestedAmount: roll.requestedAmount,
    receivedRadiationDamage,
    rolls: roll.rolls,
    canOfferReroll: Boolean(
      item?.irradiated
      && Number(irradiatedConsumableRadiationRerollIfDamage) > 0
      && receivedRadiationDamage > 0
      && Array.isArray(roll.rolls)
    ),
  };
};

/** Fallout's optional Lead Belly radiation reroll. */
export const rerollConsumableRadiationRoll = (item, rolls) => {
  if (!item?.irradiated) {
    throw new Error('[leadBelly] Reroll is only available for irradiated consumables');
  }
  if (!Array.isArray(rolls) || rolls.length === 0) {
    throw new Error('[leadBelly] No radiation dice to reroll');
  }
  const modifier = item.radiationModifier;
  if (!modifier || modifier.rollType !== 'rollCD' || !['+', '-'].includes(modifier.op)) {
    throw new Error('[leadBelly] Invalid consumable radiation modifier');
  }
  const nextRolls = [...rolls];
  const index = nextRolls.findIndex((value) => value > 0);
  if (index === -1) throw new Error('[leadBelly] No contributing die to reroll');
  nextRolls[index] = rollCombatDice();
  const total = nextRolls.reduce((sum, value) => sum + value, 0);
  const requestedAmount = modifier.op === '+' ? total : -total;
  return { requestedAmount, rolls: nextRolls };
};
