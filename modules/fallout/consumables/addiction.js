import { rollCombatDiceEffects } from '../logic/diceRollsLogic.js';

/** Resolve Fallout's addiction check from today's dose count and item target. */
export const checkAddiction = (item, dosesToday, options = {}) => {
  const addictionLevel = Number(item?.addictionLevel) || 0;
  if (addictionLevel === 0 || !item?.negativeEffect) {
    return { addicted: false, effectCount: 0, faces: [], addictionLevel: 0 };
  }

  const dicePenalty = Number(options.dicePenalty) || 0;
  const diceCount = Math.max(0, (Number(dosesToday) || 0) - dicePenalty);
  const { effectCount, faces } = rollCombatDiceEffects(diceCount);
  const addicted = options.anyEffect
    ? effectCount > 0
    : effectCount >= addictionLevel;

  return {
    addicted,
    effectCount,
    faces,
    addictionLevel,
  };
};
