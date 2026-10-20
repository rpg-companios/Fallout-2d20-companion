/**
 * Fallout formula syntax and legacy damage helpers built on the shared engine
 * dice API. Combat Die rules live in domain/diceRollsLogic.js.
 */
import {
  COMBAT_DIE_EFFECT_FACES,
  COMBAT_DIE_FACE_VALUES,
  evaluateRollConfig,
  facesToCombatUnits,
  rollByType,
  rollCombatDice,
  rollCombatDiceEffects,
  rollCustomDice,
  rollDie,
  rollMultipleCombatDice,
} from '../../../domain/diceRollsLogic.js';

export {
  COMBAT_DIE_EFFECT_FACES,
  COMBAT_DIE_FACE_VALUES,
  evaluateRollConfig,
  facesToCombatUnits,
  rollByType,
  rollCombatDice,
  rollCombatDiceEffects,
  rollCustomDice,
  rollDie,
  rollMultipleCombatDice,
};

// ─── Fallout formula syntax ───────────────────────────────────────────────────

/**
 * Вычисляет числовое значение формулы.
 * @param {string} formula
 * @returns {number}
 */
export function evaluateFormula(formula) {
  if (!formula || typeof formula !== 'string') return 0;
  const f = formula.trim();

  if (/^\d+$/.test(f)) return parseInt(f, 10);

  const parenMatch = f.match(/^\(\s*(\d+)\s*\+\s*\(\s*(\d+)\s*<cd>\s*\)\s*\)$/i);
  if (parenMatch) {
    return parseInt(parenMatch[1], 10) + rollMultipleCombatDice(parseInt(parenMatch[2], 10)).total;
  }

  const cdOnlyMatch = f.match(/^(\d+)\s*<cd>$/i);
  if (cdOnlyMatch) return rollMultipleCombatDice(parseInt(cdOnlyMatch[1], 10)).total;

  if (/^\d*d\d+$/i.test(f)) return rollCustomDice(f);

  const legacyMatch = f.match(/^(\d+)\s*\+\s*(\d+)\s*fn\s*\{CD\}$/i);
  if (legacyMatch) {
    return parseInt(legacyMatch[1], 10) + rollMultipleCombatDice(parseInt(legacyMatch[2], 10)).total;
  }

  return 0;
}

/**
 * Вычисляет массив значений для формул с запятой (раздельные броски).
 * "d20,d20" → [rollDie(20), rollDie(20)]
 * @param {string} formula
 * @returns {number[]}
 */
export function evaluateFormulaMulti(formula) {
  if (!formula || typeof formula !== 'string') return [0];
  return formula.split(',').map((part) => evaluateFormula(part.trim()));
}

// ─── Legacy helpers ───────────────────────────────────────────────────────────

export function calculateDamage(baseValue, diceCount) {
  const { total: diceTotal, rolls } = rollMultipleCombatDice(diceCount);
  return { baseValue, diceCount, rolls, diceTotal, finalValue: baseValue + diceTotal };
}

export function parseFormula(formula) {
  const regex = /(\d+)\s*\+\s*(\d+)\s*fn\s*\{\s*CD\s*\}/i;
  const match = formula.match(regex);
  if (match) {
    return { baseValue: parseInt(match[1], 10), diceCount: parseInt(match[2], 10) };
  }
  const simpleNumber = parseInt(formula, 10);
  if (!isNaN(simpleNumber)) return { baseValue: simpleNumber, diceCount: 0 };
  throw new Error(`[diceRollsLogic] Unknown formula: ${formula}`);
}

export function formatDamageFormula(baseValue, diceCount) {
  if (diceCount === 0) return `${baseValue}`;
  return `${baseValue} + ${diceCount}fn{CD}`;
}
