/**
 * diceRollsLogic.js — единый модуль для всех бросков кубиков.
 *
 * Combat Dice (CD) — кастомный d6:
 *   Грани: 1→1, 2→2, 3→0, 4→0, 5→1, 6→1
 *   "Эффект" = выпала грань 5 или 6.
 *
 * Поддерживаемые форматы формул:
 *   "15"             → 15
 *   "d20"            → 1 бросок d20
 *   "2d20"           → сумма 2 бросков d20
 *   "d20,d20"        → массив из двух отдельных бросков d20
 *   "3<cd>"          → сумма 3 Combat Dice
 *   "(5+(3<cd>))"    → 5 + сумма 3 Combat Dice
 */

// ─── Combat Dice ──────────────────────────────────────────────────────────────

/**
 * Один бросок Combat Dice. Возвращает числовое значение грани.
 * Грани: 1→1, 2→2, 3→0, 4→0, 5→1, 6→1
 * @returns {number}
 */
export function rollCombatDice() {
  const roll = Math.floor(Math.random() * 6) + 1;
  switch (roll) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 0;
    case 4: return 0;
    case 5: return 1;
    case 6: return 1;
    default: return 0;
  }
}

/**
 * N бросков Combat Dice. Возвращает сумму и массив значений.
 * @param {number} count
 * @returns {{ total: number, rolls: number[] }}
 */
export function rollMultipleCombatDice(count) {
  const rolls = [];
  let total = 0;
  for (let i = 0; i < Math.max(0, count); i++) {
    const r = rollCombatDice();
    rolls.push(r);
    total += r;
  }
  return { total, rolls };
}

/**
 * N бросков Combat Dice с подсчётом "эффектов" (грани 5 и 6).
 * Используется для проверок привыкания, критических эффектов и т.д.
 * @param {number} count
 * @returns {{ effectCount: number, faces: number[] }} faces — исходные грани (1–6)
 */
export function rollCombatDiceEffects(count) {
  const faces = [];
  let effectCount = 0;
  for (let i = 0; i < Math.max(0, count); i++) {
    const face = Math.floor(Math.random() * 6) + 1;
    faces.push(face);
    if (face === 5 || face === 6) effectCount++;
  }
  return { effectCount, faces };
}

// ─── Standard Dice ────────────────────────────────────────────────────────────

/**
 * Один бросок стандартного кубика с N гранями.
 * @param {number} sides
 * @returns {number}
 */
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Сумма N бросков стандартного кубика.
 * @param {string} diceString — формат "2d20", "d6", "1d100"
 * @returns {number}
 */
export function rollCustomDice(diceString) {
  const parts = String(diceString).toLowerCase().split('d');
  const numDice = parts[0] ? parseInt(parts[0], 10) : 1;
  const numSides = parseInt(parts[1], 10);
  if (isNaN(numDice) || isNaN(numSides) || numSides <= 0) return 0;
  let total = 0;
  for (let i = 0; i < numDice; i++) total += rollDie(numSides);
  return total;
}

// ─── Roll by type ─────────────────────────────────────────────────────────────

export function rollByType(rollType, rollValue = 1) {
  const count = Math.max(0, parseInt(rollValue, 10) || 0);
  if (count === 0) return 0;
  if (rollType === 'rollCD') return rollMultipleCombatDice(count).total;
  if (rollType === 'rollD20' || rollType === 'D20') {
    let total = 0;
    for (let i = 0; i < count; i++) total += rollDie(20);
    return total;
  }
  return 0;
}

export function evaluateRollConfig(config = {}) {
  const base = parseInt(config.base, 10) || 0;
  const { rollType, rollValue } = config;
  if (!rollType || !rollValue) return base;
  const rolled = rollByType(rollType, rollValue);
  const op = config.op === '-' ? -1 : 1;
  return base + op * rolled;
}

// ─── Formula Evaluator ────────────────────────────────────────────────────────

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
