import { describe, expect, test } from 'vitest';
import { calculateDerivedStats, calculateAttributeTotal } from './resolvers.js';
import {
  legacyEffectToStore,
  storeEffectToLegacy,
  syncTimedEffectsToStore,
  effectsDictToLegacyArray,
} from './effectsSync.js';
import { selectActiveTimedEffects } from './selectors.js';

const createMockStore = (initialEffects = {}) => {
  let effects = { ...initialEffects };
  const derivedStats = {};

  const store = {
    get effects() {
      return effects;
    },
    addEffect: (effect) => {
      const id = effect.id || 'generated-id';
      effects = {
        ...effects,
        [id]: { ...effect, id, active: true },
      };
    },
    updateEffect: (effectId, patch) => {
      effects = {
        ...effects,
        [effectId]: { ...effects[effectId], ...patch },
      };
    },
    expireEffect: (effectId) => {
      if (!effects[effectId]) return;
      effects = {
        ...effects,
        [effectId]: { ...effects[effectId], active: false },
      };
    },
    triggerDependentCalculations: () => {},
    derivedStats,
  };

  return store;
};

describe('effects integration', () => {
  test('stimpak maxHp bonus is added to derived stats', () => {
    const attributes = {
      END: { id: 'END', base: 5, modifiers: [], total: 5 },
      LCK: { id: 'LCK', base: 5, modifiers: [], total: 5 },
    };
    const effects = {
      'maxhp-1': legacyEffectToStore({
        id: 'maxhp-1',
        effectName: 'maxHp:+2',
        effectLabel: 'maxHp:+2',
        effectKind: 'positive',
        scenesLeft: 3,
        maxHpModifier: { op: '+', value: 2 },
      }),
    };

    const stats = calculateDerivedStats(attributes, effects, null, 1);
    expect(stats.maxHealth.base).toBe(10);
    expect(stats.maxHealth.total).toBe(12);
  });

  test('expired effect is removed from active timed effects', () => {
    const state = {
      effects: {
        active: legacyEffectToStore({
          id: 'active-1',
          effectName: 'Buff',
          effectKind: 'positive',
          scenesLeft: 2,
        }),
        expired: {
          ...legacyEffectToStore({
            id: 'expired-1',
            effectName: 'Old',
            effectKind: 'positive',
            scenesLeft: 0,
          }),
          active: false,
        },
      },
    };

    expect(selectActiveTimedEffects(state)).toHaveLength(1);
    expect(selectActiveTimedEffects(state)[0].id).toBe('active-1');
  });

  test('expired maxHp effect removes bonus from derived stats', () => {
    const attributes = {
      END: { id: 'END', base: 5, modifiers: [], total: 5 },
      LCK: { id: 'LCK', base: 5, modifiers: [], total: 5 },
    };
    const activeEffects = {
      'maxhp-1': legacyEffectToStore({
        id: 'maxhp-1',
        effectName: 'maxHp:+2',
        effectKind: 'positive',
        maxHpModifier: { op: '+', value: 2 },
      }),
    };
    const expiredEffects = {
      'maxhp-1': { ...activeEffects['maxhp-1'], active: false },
    };

    const withBonus = calculateDerivedStats(attributes, activeEffects, null, 1);
    const withoutBonus = calculateDerivedStats(attributes, expiredEffects, null, 1);

    expect(withBonus.maxHealth.total).toBe(12);
    expect(withoutBonus.maxHealth.total).toBe(10);
  });

  test('damage resistance bonus from timed effects is calculated', () => {
    const attributes = {
      END: { id: 'END', base: 5, modifiers: [], total: 5 },
      LCK: { id: 'LCK', base: 5, modifiers: [], total: 5 },
    };
    const effects = {
      'dr-1': legacyEffectToStore({
        id: 'dr-1',
        effectName: 'dr:physical:+1',
        effectKind: 'positive',
        damageResistanceModifier: { type: 'physical', op: '+', value: 1 },
      }),
    };

    const stats = calculateDerivedStats(attributes, effects, null, 1);
    expect(stats.damageResistance.physical.total).toBe(1);
  });

  test('perk attribute modifier updates attribute total', () => {
    const attribute = {
      id: 'STR',
      base: 5,
      modifiers: [{ source: 'perk_strong_back', value: 1, operation: '+' }],
      total: 0,
    };
    attribute.total = calculateAttributeTotal(attribute);
    expect(attribute.total).toBe(6);
  });

  test('syncTimedEffectsToStore adds and expires effects', () => {
    const store = createMockStore({
      old: {
        id: 'old',
        name: 'Old',
        type: 'positive',
        active: true,
        scenesLeft: 1,
      },
    });

    syncTimedEffectsToStore([
      {
        id: 'new-1',
        effectName: 'maxHp:+2',
        effectLabel: 'maxHp:+2',
        effectKind: 'positive',
        scenesLeft: 3,
        maxHpModifier: { op: '+', value: 2 },
      },
    ], store);

    expect(store.effects.old.active).toBe(false);
    expect(store.effects['new-1'].active).toBe(true);
    expect(store.effects['new-1'].maxHpModifier).toEqual({ op: '+', value: 2 });
  });

  test('round-trip legacy effect preserves modifiers', () => {
    const legacy = {
      id: 'fx-1',
      effectName: 'maxHp:+2',
      effectLabel: 'maxHp:+2',
      effectKind: 'positive',
      scenesLeft: 2,
      maxHpModifier: { op: '+', value: 2 },
      damageResistanceModifier: { type: 'energy', op: '+', value: 1 },
    };

    const restored = storeEffectToLegacy(legacyEffectToStore(legacy));
    expect(restored.maxHpModifier).toEqual(legacy.maxHpModifier);
    expect(restored.damageResistanceModifier).toEqual(legacy.damageResistanceModifier);
    expect(restored.effectKind).toBe('positive');
  });

  test('effectsDictToLegacyArray maps store effects for domain helpers', () => {
    const legacy = effectsDictToLegacyArray({
      a: legacyEffectToStore({
        id: 'a',
        effectName: 'Buff',
        effectKind: 'positive',
        maxHpModifier: { op: '+', value: 1 },
      }),
    });

    expect(legacy).toHaveLength(1);
    expect(legacy[0].effectKind).toBe('positive');
    expect(legacy[0].maxHpModifier).toEqual({ op: '+', value: 1 });
  });
});
