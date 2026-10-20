import { getCanonicalAttributeKey } from './characterCreation.js';

const toStringSafe = (value) => (value === undefined || value === null ? '' : String(value).trim());

const normalizeAttributeToken = (token) =>
  getCanonicalAttributeKey(toStringSafe(token).toUpperCase());

const parseAttributeDelta = (text) => {
  const raw = toStringSafe(text);
  if (!raw) return null;

  const match = raw.match(/([+-]?\d+)\s*<([^>]+)>/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const attribute = normalizeAttributeToken(match[2]);
  if (!attribute || !Number.isFinite(amount)) return null;

  return { attribute, amount };
};

/** Fallout timed-effect labels may encode temporary SPECIAL deltas as `+N<KEY>`. */
export const getTimedAttributeModifiers = (activeEffects = []) => (
  activeEffects.reduce((acc, effect) => {
    if (!effect || effect.effectKind !== 'positive') return acc;

    const parsed = parseAttributeDelta(effect.effectLabel) || parseAttributeDelta(effect.effectName);
    if (!parsed) return acc;

    acc[parsed.attribute] = (acc[parsed.attribute] || 0) + parsed.amount;
    return acc;
  }, {})
);

/** Sum Fallout's temporary maximum-health modifiers. */
export const getTimedMaxHpBonus = (activeEffects = []) =>
  activeEffects.reduce((sum, effect) => {
    if (!effect || effect.effectKind !== 'positive') return sum;
    const mod = effect.maxHpModifier;
    if (!mod) return sum;
    const val = Number(mod.value) || 0;
    return mod.op === '+' ? sum + val : sum - val;
  }, 0);

/** Sum Fallout's typed damage-resistance modifiers by catalog channel. */
export const getTimedDamageResistanceBonus = (activeEffects = []) =>
  activeEffects.reduce((acc, effect) => {
    if (!effect || effect.effectKind !== 'positive') return acc;
    const mod = effect.damageResistanceModifier;
    if (!mod) return acc;
    const val = Number(mod.value) || 0;
    const delta = mod.op === '+' ? val : -val;
    acc[mod.type] = (acc[mod.type] || 0) + delta;
    return acc;
  }, {});

/** Sum Fallout's temporary defense modifiers. */
export const getTimedDefenseBonus = (activeEffects = []) =>
  activeEffects.reduce((sum, effect) => {
    if (!effect || effect.effectKind !== 'positive') return sum;
    const mod = effect.defenseModifier;
    if (!mod) return sum;
    const val = Number(mod.value) || 0;
    return mod.op === '+' ? sum + val : sum - val;
  }, 0);

/** Sum Fallout's temporary weapon-damage modifiers. */
export const getTimedDamageBonus = (activeEffects = []) =>
  activeEffects.reduce((sum, effect) => {
    if (!effect || effect.effectKind !== 'positive') return sum;
    const mod = effect.damageModifier;
    if (!mod) return sum;
    const val = Number(mod.value) || 0;
    return mod.op === '+' ? sum + val : sum - val;
  }, 0);

/** Sum Fallout's temporary action-point modifiers. */
export const getTimedApBonus = (activeEffects = []) =>
  activeEffects.reduce((sum, effect) => {
    if (!effect || effect.effectKind !== 'positive') return sum;
    const mod = effect.apModifier;
    if (!mod) return sum;
    const val = Number(mod.value) || 0;
    return mod.op === '+' ? sum + val : sum - val;
  }, 0);
