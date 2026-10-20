import { getSettingService } from '../../domain/registry.js';

/** Generic store bridge for action factories declared by the active setting. */
export const createSettingActionActions = (set, get) => {
  const featureCache = new Map();
  const actionCache = new Map();

  const resolveFeatureActions = (featureId) => {
    const feature = getSettingService('inventory')?.features?.[featureId] ?? null;
    if (!feature || typeof feature.createActions !== 'function') {
      featureCache.delete(featureId);
      return null;
    }
    const cached = featureCache.get(featureId);
    if (cached?.feature === feature) return cached.actions;
    const actions = feature.createActions(set, get);
    featureCache.set(featureId, { feature, actions });
    return actions;
  };

  return {
    getSettingAction: (featureId, actionId) => {
      if (typeof featureId !== 'string' || !featureId
          || typeof actionId !== 'string' || !actionId) {
        return () => undefined;
      }
      const key = `${featureId}\u0000${actionId}`;
      if (!actionCache.has(key)) {
        actionCache.set(key, (...args) => {
          const action = resolveFeatureActions(featureId)?.[actionId];
          return typeof action === 'function' ? action(...args) : undefined;
        });
      }
      return actionCache.get(key);
    },
  };
};
