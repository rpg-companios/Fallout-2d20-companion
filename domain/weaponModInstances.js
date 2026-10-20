// Generic reconciliation for modifier instances attached to item targets.
// The active setting supplies target discovery, modifier-record identity and
// construction; this module only reconciles links against available records.

import { generateStackKey } from './itemIdentity';

const defaultGetModifierId = (item) => item?.modifierId || item?.id || null;

const defaultCreateModifierInstance = ({ id, modifierId, targetId, slotId, stackKey }) => ({
  id,
  instanceId: id,
  modifierId,
  quantity: 1,
  equipped: true,
  installedOn: targetId,
  ...(slotId ? { installedSlot: slotId } : {}),
  stackKey,
});

/**
 * Reconcile modifier inventory records to currently declared target roles.
 * Idempotent: once every role has one linked record, another pass is a no-op.
 *
 * @param {object} state character/save data; `state.items` is updated if needed
 * @param {Set<string>} modifierIds active setting's catalog modifier IDs
 * @param {object} adapters
 * @param {(item: object) => string|null} adapters.getModifierId
 * @param {(state: object, modifierIds: Set<string>) => Array<{targetId: string, modifierId: string, slotId?: string}>} adapters.getAdditionalHostRoles
 * @param {(params: object) => object} adapters.createModifierInstance
 * @param {(item: object, context: object) => boolean} adapters.shouldPreserveUnmatched
 * @returns {object} the input state
 */
export function syncWeaponModInstances(state, modifierIds, adapters = {}) {
  if (!state || typeof state !== 'object') return state;
  const isTrackedModifier = (id) => typeof id === 'string'
    && modifierIds instanceof Set
    && modifierIds.has(id);
  const getModifierId = typeof adapters.getModifierId === 'function'
    ? adapters.getModifierId
    : defaultGetModifierId;
  const createModifierInstance = typeof adapters.createModifierInstance === 'function'
    ? adapters.createModifierInstance
    : defaultCreateModifierInstance;
  const getAdditionalHostRoles = typeof adapters.getAdditionalHostRoles === 'function'
    ? adapters.getAdditionalHostRoles
    : () => [];
  const shouldPreserveUnmatched = typeof adapters.shouldPreserveUnmatched === 'function'
    ? adapters.shouldPreserveUnmatched
    : () => false;
  const items = state.items && typeof state.items === 'object' ? state.items : {};

  const roles = new Map();
  const addRole = (targetId, modifierId, slotId) => {
    if (typeof targetId !== 'string' || !targetId || !isTrackedModifier(modifierId)) return;
    const pair = `${targetId}|${modifierId}`;
    if (!roles.has(pair)) roles.set(pair, { targetId, modifierId, slotId: slotId || null });
  };

  // The setting maps its own item fields and embedded equipment to opaque
  // target IDs; the engine receives only the resulting modifier-role records.
  const additionalRoles = getAdditionalHostRoles(state, modifierIds);
  if (Array.isArray(additionalRoles)) {
    for (const role of additionalRoles) {
      addRole(role?.targetId, role?.modifierId, role?.slotId);
    }
  }

  // Existing linked records and free modifier instances in inventory.
  const boundByPair = new Map();
  const boundKeys = new Set();
  const freeByModifier = new Map();
  for (const [key, item] of Object.entries(items)) {
    if (!item || typeof item !== 'object') continue;
    const modifierId = getModifierId(item);
    if (!isTrackedModifier(modifierId)) continue;
    if (item.installedOn) {
      boundKeys.add(key);
      const pair = `${item.installedOn}|${modifierId}`;
      if (!boundByPair.has(pair)) boundByPair.set(pair, []);
      boundByPair.get(pair).push(key);
    } else if (!item.equipped) {
      if (!freeByModifier.has(modifierId)) freeByModifier.set(modifierId, []);
      freeByModifier.get(modifierId).push(key);
    }
  }

  const next = { ...items };
  let changed = false;
  const unbind = (key) => {
    next[key] = { ...next[key], equipped: false };
    delete next[key].installedOn;
    delete next[key].installedSlot;
    changed = true;
  };

  // Each declared role owns exactly one linked instance. Fill only shortages;
  // repeated loads therefore never duplicate an already-consistent record.
  let counter = 1;
  for (const role of roles.values()) {
    const pair = `${role.targetId}|${role.modifierId}`;
    let bound = boundByPair.get(pair) || [];
    if (bound.length > 1) {
      for (const key of bound.slice(1)) {
        unbind(key);
        boundKeys.delete(key);
      }
      bound = [bound[0]];
      boundByPair.set(pair, bound);
    }
    if (bound.length === 1) {
      const [key] = bound;
      if (role.slotId && !next[key].installedSlot) {
        next[key] = { ...next[key], installedSlot: role.slotId };
        changed = true;
      }
      continue;
    }

    const free = (freeByModifier.get(role.modifierId) || [])
      .filter((key) => next[key] && !next[key].installedOn && !next[key].equipped);
    if (free.length > 0) {
      const key = free[0];
      freeByModifier.set(role.modifierId, free.slice(1));
      next[key] = {
        ...next[key],
        equipped: true,
        installedOn: role.targetId,
        ...(role.slotId ? { installedSlot: role.slotId } : {}),
      };
      changed = true;
      continue;
    }

    let key = `inst-${role.modifierId}-sync${counter}`;
    while (next[key]) {
      counter += 1;
      key = `inst-${role.modifierId}-sync${counter}`;
    }
    counter += 1;
    next[key] = createModifierInstance({
      id: key,
      modifierId: role.modifierId,
      targetId: role.targetId,
      slotId: role.slotId,
      stackKey: generateStackKey(role.modifierId),
    });
    changed = true;
  }

  // Orphaned links return to inventory unless the setting owns their lifecycle.
  for (const key of boundKeys) {
    const item = next[key];
    if (!item || !item.installedOn) continue;
    const modifierId = getModifierId(item);
    if (shouldPreserveUnmatched(item, { targetId: item.installedOn, modifierId, state })) continue;
    const pair = `${item.installedOn}|${modifierId}`;
    if (!roles.has(pair)) unbind(key);
  }

  if (changed) state.items = next;
  return state;
}
