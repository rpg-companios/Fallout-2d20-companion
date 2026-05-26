const bodyPlansRegistry = require('../data/bodyplans/bodyplans.json');

const ROBOT_ORIGIN_TO_PLAN = {
  robobrain: 'robobrain',
  misterHandy: 'misterHandy',
  protectron: 'protectron',
  assaultron: 'assaultron',
  sentryBot: 'sentryBot',
};

export function resolveBodyPlan(character) {
  const traitPlan = character?.trait?.modifiers?.robotBodyPlan;
  if (traitPlan && bodyPlansRegistry[traitPlan]) return traitPlan;

  const originPlan = character?.origin?.robotBodyPlan;
  if (originPlan && bodyPlansRegistry[originPlan]) return originPlan;

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
      capabilities: plan.slotCapabilities?.[slotKey] || { canEquipArmor: false, canEquipWeapon: false },
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
