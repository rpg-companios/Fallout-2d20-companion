import { getSettingData } from 'engine:domain/registry';

const getBodyPlans = () => getSettingData('bodyplans') ?? {};
const getOrigins = () => getSettingData('origins') ?? [];

/**
 * Body-plan rules are read from the active setting on every call so loading a
 * package after app startup immediately makes its plans available.
 */
export function resolveBodyPlan(character) {
  const bodyPlans = getBodyPlans();
  const originPlan = character?.origin?.bodyPlan;
  if (originPlan && bodyPlans[originPlan]) return originPlan;

  // Legacy saves may only carry an origin id. Resolve the plan from setting data
  // rather than maintaining a duplicate package-origin lookup table.
  const originId = character?.origin?.id;
  const origin = originId ? getOrigins().find((entry) => entry?.id === originId) : null;
  const legacyPlan = origin?.bodyPlan;
  if (legacyPlan && bodyPlans[legacyPlan]) return legacyPlan;

  return bodyPlans.humanoid ? 'humanoid' : null;
}

export function createSlotsFromBodyPlan(planId) {
  const plan = getBodyPlans()[planId];
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

/** Return slot identifiers from either legacy string or structured slots. */
export function getBodyPlanSlotIds(plan) {
  return (Array.isArray(plan?.slots) ? plan.slots : [])
    .map((slot) => (typeof slot === 'string' ? slot : slot?.id))
    .filter(Boolean);
}

export function getDefaultLimbs(planId) {
  return { ...(getBodyPlans()[planId]?.defaults || {}) };
}

export function getDefaultPlating(planId) {
  return { ...(getBodyPlans()[planId]?.defaultPlating || {}) };
}

export function getBodyPlan(planId) {
  return getBodyPlans()[planId] || null;
}
