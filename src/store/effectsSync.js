// src/store/effectsSync.js
// Convert between legacy timed-effect arrays and normalized store effects dict

const STORE_ONLY_EFFECT_FIELDS = new Set(['name', 'type', 'active', 'parameters']);

const effectPayloadWithoutStoreFields = (effect) => Object.fromEntries(
  Object.entries(effect ?? {}).filter(([key]) => !STORE_ONLY_EFFECT_FIELDS.has(key)),
);

// Timed-effect payloads belong to the active setting. Preserve their fields
// opaquely across the store/legacy-array bridge; the engine owns only the
// common display and lifecycle envelope.
export const legacyEffectToStore = (effect) => ({
  ...effect,
  id: effect.id,
  name: effect.effectLabel || effect.effectName || 'Unnamed Effect',
  effectName: effect.effectName,
  effectLabel: effect.effectLabel,
  effectKind: effect.effectKind,
  type: effect.effectKind || 'positive',
  active: true,
  parameters: [],
  scenesLeft: effect.scenesLeft || 0,
});

export const storeEffectToLegacy = (effect) => {
  const payload = effectPayloadWithoutStoreFields(effect);
  return {
    ...payload,
    effectName: effect.effectName ?? effect.name,
    effectLabel: effect.effectLabel ?? effect.name,
    effectKind: effect.effectKind ?? effect.type,
    scenesLeft: effect.scenesLeft || 0,
  };
};

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

};
