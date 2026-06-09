// src/store/effectsSync.js
// Convert between legacy timed-effect arrays and normalized store effects dict

export const legacyEffectToStore = (effect) => ({
  id: effect.id,
  name: effect.effectLabel || effect.effectName || 'Unnamed Effect',
  effectName: effect.effectName,
  effectLabel: effect.effectLabel,
  effectKind: effect.effectKind,
  type: effect.effectKind || 'positive',
  active: true,
  parameters: [],
  maxHpModifier: effect.maxHpModifier,
  damageResistanceModifier: effect.damageResistanceModifier,
  createdAt: effect.createdAt,
  expiresAt: effect.expiresAt,
  durationMs: effect.durationMs,
  scenesLeft: effect.scenesLeft || 0,
  sourceName: effect.sourceName,
});

export const storeEffectToLegacy = (effect) => ({
  id: effect.id,
  effectName: effect.effectName ?? effect.name,
  effectLabel: effect.effectLabel ?? effect.name,
  effectKind: effect.effectKind ?? effect.type,
  maxHpModifier: effect.maxHpModifier,
  damageResistanceModifier: effect.damageResistanceModifier,
  createdAt: effect.createdAt,
  expiresAt: effect.expiresAt,
  durationMs: effect.durationMs,
  scenesLeft: effect.scenesLeft || 0,
  sourceName: effect.sourceName,
});

export const legacyEffectsArrayToStore = (effectsArray = []) => {
  const result = {};
  effectsArray.forEach((effect) => {
    if (!effect?.id) return;
    result[effect.id] = legacyEffectToStore(effect);
  });
  return result;
};

export const effectsDictToLegacyArray = (effectsDict = {}) =>
  Object.values(effectsDict)
    .filter((effect) => effect.active)
    .map(storeEffectToLegacy);

/**
 * Sync legacy timed-effects array into Zustand store via add/update/expire
 */
export const syncTimedEffectsToStore = (nextEffects, store) => {
  const prevActiveIds = new Set(
    Object.entries(store.effects).filter(([, effect]) => effect.active).map(([id]) => id),
  );
  const nextIds = new Set(nextEffects.map((effect) => effect.id));

  prevActiveIds.forEach((id) => {
    if (!nextIds.has(id)) store.expireEffect(id);
  });

  nextEffects.forEach((effect) => {
    if (!store.effects[effect.id]) {
      store.addEffect(legacyEffectToStore(effect));
      return;
    }
    store.updateEffect(effect.id, {
      ...legacyEffectToStore(effect),
      active: true,
    });
  });

  store.triggerDependentCalculations();
};
