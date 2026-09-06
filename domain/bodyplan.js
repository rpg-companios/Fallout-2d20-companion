import { getBodyPlans } from './registry';
const bodyPlansRegistry = getBodyPlans();

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

  return getBodyPlanSlotIds(plan).reduce((acc, slotKey) => {
    acc[slotKey] = {
      limb: null,
      armor: null,
      plating: null,
      frame: null,
      heldWeapon: null,
    };
    return acc;
  }, {});
}

/**
 * Идентификаторы слотов плана тела.
 *
 * Слоты в данных бывают двух видов:
 *   ["head", "arm1"]                             — старый формат (строки);
 *   [{ id: "head", accepts: ["head"], ... }, …]  — новый формат (объекты).
 *
 * Оба допустимы: миграция данных уже перевела plans в объекты, а читатели
 * кода переходят постепенно (этап 3). Единственная точка, которая знает про
 * оба вида, — эта функция.
 *
 * @param {object} plan — запись из bodyplans.json
 * @returns {string[]}
 */
export function getBodyPlanSlotIds(plan) {
  return (Array.isArray(plan?.slots) ? plan.slots : [])
    .map((slot) => (typeof slot === 'string' ? slot : slot?.id))
    .filter(Boolean);
}

export function getDefaultLimbs(planId) {
  return { ...(bodyPlansRegistry[planId]?.defaults || {}) };
}

export function getDefaultPlating(planId) {
  return { ...(bodyPlansRegistry[planId]?.defaultPlating || {}) };
}

export function getBodyPlan(planId) {
  return bodyPlansRegistry[planId] || null;
}
