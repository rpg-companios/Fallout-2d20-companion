// Shared arithmetic for linked equipment variants and installable mods.
// Keep this pure so the catalog, previews, and persisted characters use the same rules.

export const NUMERIC_MODIFIER_OPERATORS = Object.freeze(['+', '-', '*', '/']);

const isFiniteNumeric = (value) => {
  if (typeof value === 'string' && value.trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number);
};

/**
 * Apply one numeric operation to a base value.
 *
 * `set` is retained for existing built-in weapon mods. User equipment documents
 * are validated against `NUMERIC_MODIFIER_OPERATORS` and cannot use `set`.
 */
export const applyNumericModifier = (
  baseValue,
  modifier,
  {
    field = 'value',
    integer = false,
    allowSet = false,
    min = null,
    clampMin = false,
  } = {},
) => {
  if (modifier === undefined || modifier === null) return baseValue;

  const base = Number(baseValue);
  if (!Number.isFinite(base)) {
    throw new TypeError(`Base value for ${field} must be a finite number.`);
  }

  const isObjectModifier = typeof modifier === 'object' && !Array.isArray(modifier);
  const op = isObjectModifier ? modifier.op : '+';
  const rawOperand = isObjectModifier ? modifier.value : modifier;
  if (!isFiniteNumeric(rawOperand)) {
    throw new TypeError(`Modifier value for ${field} must be a finite number.`);
  }
  const operand = Number(rawOperand);

  let result;
  switch (op) {
    case '+':
      result = base + operand;
      break;
    case '-':
      result = base - operand;
      break;
    case '*':
      result = base * operand;
      break;
    case '/':
      if (operand === 0) throw new RangeError(`Cannot divide ${field} by zero.`);
      result = base / operand;
      break;
    case 'set':
      if (!allowSet) throw new TypeError(`Operator "set" is not allowed for ${field}.`);
      result = operand;
      break;
    default:
      throw new TypeError(`Unsupported numeric operator for ${field}: ${String(op)}.`);
  }

  if (!Number.isFinite(result)) {
    throw new RangeError(`Modifier result for ${field} must be finite.`);
  }

  if (integer) {
    const rounded = Math.round(result);
    if (Math.abs(result - rounded) > 1e-9) {
      throw new RangeError(`Modifier result for ${field} must be an integer.`);
    }
    result = rounded;
  }

  if (min !== null && result < min) {
    if (clampMin) result = min;
    else throw new RangeError(`Modifier result for ${field} cannot be less than ${min}.`);
  }

  return result;
};

/**
 * Resolve modifiers against an opaque target-ID map. The engine supplies each
 * target's current numeric value and optional bounds; settings declare target
 * IDs and the operations that should apply to them.
 */
export const resolveTargetedNumericModifiers = (targets = {}, modifiers = []) => {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new TypeError('Modifier targets must be an object keyed by target ID.');
  }
  if (!Array.isArray(modifiers)) {
    throw new TypeError('Targeted modifiers must be an array.');
  }

  const values = new Map();
  const touched = new Set();
  for (const modifier of modifiers) {
    const targetId = modifier?.targetId;
    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw new TypeError('A targeted modifier must include a non-empty targetId.');
    }
    const target = targets[targetId];
    if (!target || typeof target !== 'object') {
      throw new Error(`Unknown numeric modifier target: ${targetId}`);
    }

    if (target.min !== undefined && target.min !== null && !Number.isFinite(target.min)) {
      throw new TypeError(`Minimum for target ${targetId} must be a finite number.`);
    }
    if (target.max !== undefined && target.max !== null && !Number.isFinite(target.max)) {
      throw new TypeError(`Maximum for target ${targetId} must be a finite number.`);
    }

    const baseValue = values.has(targetId) ? values.get(targetId) : target.value;
    let nextValue = applyNumericModifier(baseValue, {
      op: modifier.operation,
      value: modifier.value,
    }, {
      field: `target ${targetId}`,
      min: target.min ?? null,
      clampMin: target.clampMin === true,
    });

    if (target.max !== undefined && target.max !== null && nextValue > target.max) {
      if (target.clampMax === true) nextValue = target.max;
      else throw new RangeError(`Modifier result for target ${targetId} exceeds its maximum.`);
    }

    values.set(targetId, nextValue);
    touched.add(targetId);
  }

  return [...touched].map((targetId) => ({
    targetId,
    previousValue: Number(targets[targetId].value),
    value: values.get(targetId),
  }));
};

/**
 * Validate and evaluate a user-authored operation without mutating the source.
 * Used at import time, before a bad record can reach the live catalog.
 */
export const validateUserNumericModifier = (baseValue, modifier, options = {}) => {
  if (!modifier || typeof modifier !== 'object' || Array.isArray(modifier)) {
    throw new TypeError('A user numeric modifier must be an object with op and value.');
  }
  if (!NUMERIC_MODIFIER_OPERATORS.includes(modifier.op)) {
    throw new TypeError(`Unsupported user numeric operator: ${String(modifier.op)}.`);
  }
  if (!Object.prototype.hasOwnProperty.call(modifier, 'value')) {
    throw new TypeError('A user numeric modifier must include value.');
  }
  return applyNumericModifier(baseValue, modifier, options);
};
