const bodyPlansRegistry = require('../data/bodyplans/bodyplans.json');

/**
 * Capability semantics:
 * - canEquipWeapon: strict allowlist (default false)
 * - canEquipArmor: slot can accept a defensive wearable layer in broad terms (default true)
 *
 * Concrete equipment families (armor/clothing/hats/robot plating/frame/etc.)
 * are intentionally NOT decided at bodyplan level and must be constrained by
 * origin/trait/item rules.
 */

const ROBOT_ORIGIN_TO_PLAN = {
  robobrain: 'robobrain',
  misterHandy: 'misterHandy',
  protectron: 'protectron',
  assaultron: 'assaultron',
  sentryBot: 'sentryBot',
};

export function resolveBodyPlan(character) {
  // Source of truth (per docs/schema/02-traits.md T-1): origin.bodyPlan.
  // The legacy fallback `trait.modifiers.robotBodyPlan` has been removed —
  // trait-level robot duplicates (robotBodyPlan/robotType/robotRules) were
  // dropped from data/traits/traits.json in the same refactor.
  const originPlan = character?.origin?.bodyPlan;
  if (originPlan && bodyPlansRegistry[originPlan]) return originPlan;

  // Defensive fallback: legacy origins without `bodyPlan` but with a known
  // robot `id` (e.g. older saves). Can be removed once all live saves carry
  // an explicit origin.bodyPlan.
  const originId = character?.origin?.id;
  if (originId && ROBOT_ORIGIN_TO_PLAN[originId] && bodyPlansRegistry[ROBOT_ORIGIN_TO_PLAN[originId]]) {
    return ROBOT_ORIGIN_TO_PLAN[originId];
  }

  return bodyPlansRegistry.humanoid ? 'humanoid' : null;
}

export function createSlotsFromBodyPlan(planId) {
  const plan = bodyPlansRegistry[planId];
  if (!plan) return {};

  return (plan.slots || []).reduce((acc, slotKey) => {
    acc[slotKey] = {
      limb: null,
      armor: null,
      plating: null,
      frame: null,
      heldWeapon: null,
      capabilities: {
        canEquipWeapon: plan.slotCapabilities?.[slotKey]?.canEquipWeapon === true,
        canEquipArmor: plan.slotCapabilities?.[slotKey]?.canEquipArmor !== false,
      },
    };
    return acc;
  }, {});
}

export function getDefaultLimbs(planId) {
  return { ...(bodyPlansRegistry[planId]?.defaults || {}) };
}

export function getBodyPlan(planId) {
  return bodyPlansRegistry[planId] || null;
}
