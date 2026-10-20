/**
 * Standard die primitives and shared 2d20 Combat Dice mechanics.
 * Setting-specific formula syntax and data interpretation belong to packages.
 */

/** Roll one standard die with N sides. */
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/** Sum a conventional NdS expression such as `2d20`, `d6`, or `1d100`. */
export function rollCustomDice(diceString) {
  const parts = String(diceString).toLowerCase().split('d');
  const numDice = parts[0] ? parseInt(parts[0], 10) : 1;
  const numSides = parseInt(parts[1], 10);
  if (isNaN(numDice) || isNaN(numSides) || numSides <= 0) return 0;
  let total = 0;
  for (let i = 0; i < numDice; i++) total += rollDie(numSides);
  return total;
}

// Shared 2d20 Combat Die face table: 1→1, 2→2, 3/4→0, 5/6→1; 5/6 are Effects.
export const COMBAT_DIE_FACE_VALUES = { 1: 1, 2: 2, 3: 0, 4: 0, 5: 1, 6: 1 };
export const COMBAT_DIE_EFFECT_FACES = [5, 6];
const COMBAT_DIE_EFFECT_FACE_SET = new Set(COMBAT_DIE_EFFECT_FACES);

/** Sum unit values for already-rolled Combat Die faces (1..6). */
export function facesToCombatUnits(faces) {
  return (faces || []).reduce((sum, face) => sum + (COMBAT_DIE_FACE_VALUES[face] ?? 0), 0);
}

/** Roll one Combat Die and return its unit value. */
export function rollCombatDice() {
  return COMBAT_DIE_FACE_VALUES[Math.floor(Math.random() * 6) + 1] ?? 0;
}

/** Roll N Combat Dice; return the summed units and individual unit values. */
export function rollMultipleCombatDice(count) {
  const rolls = [];
  let total = 0;
  for (let i = 0; i < Math.max(0, count); i++) {
    const result = rollCombatDice();
    rolls.push(result);
    total += result;
  }
  return { total, rolls };
}

/** Roll N Combat Dice and count Effects; faces contains the original 1..6 results. */
export function rollCombatDiceEffects(count) {
  const faces = [];
  let effectCount = 0;
  for (let i = 0; i < Math.max(0, count); i++) {
    const face = Math.floor(Math.random() * 6) + 1;
    faces.push(face);
    if (COMBAT_DIE_EFFECT_FACE_SET.has(face)) effectCount++;
  }
  return { effectCount, faces };
}

/** Roll by the shared 2d20 dice type identifiers used by setting data. */
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

/** Resolve a base-plus-roll setting record with its optional sign. */
export function evaluateRollConfig(config = {}) {
  const base = parseInt(config.base, 10) || 0;
  const { rollType, rollValue } = config;
  if (!rollType || !rollValue) return base;
  const rolled = rollByType(rollType, rollValue);
  const op = config.op === '-' ? -1 : 1;
  return base + op * rolled;
}
