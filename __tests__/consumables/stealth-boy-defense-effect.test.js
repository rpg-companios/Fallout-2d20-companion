import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyConsumableToEffects,
  getDefenseModifierEffectLabel,
  getTimedDefenseBonus,
} from '../../domain/effects';
import { setCurrentModuleLocale } from '../../i18n/locale';

const stealthBoy = {
  id: 'chem_stealth_boy',
  name: 'Стелс-бой',
  positiveEffect: {
    defenseModifier: { op: '+', value: 2 },
  },
  positiveEffectDuration: 'lasting',
};

describe('Stealth Boy defense effect', () => {
  beforeEach(() => {
    setCurrentModuleLocale('ru-RU');
  });

  it('adds the defense modifier once and exposes a localized label', () => {
    const result = applyConsumableToEffects(stealthBoy, []);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectName: 'def:+2',
      effectLabel: 'Защита: +2',
      scenesLeft: 1,
      defenseModifier: { op: '+', value: 2 },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toContain('Защита: +2');
    expect(result.notificationEvents).toEqual([
      { kind: 'positive', message: result.events[0] },
    ]);
    expect(getTimedDefenseBonus(result.effects)).toBe(2);
  });

  it('formats both new and persisted defense effects for the active module locale', () => {
    expect(getDefenseModifierEffectLabel({ op: '+', value: 2 })).toBe('Защита: +2');

    setCurrentModuleLocale('en-EN');
    expect(getDefenseModifierEffectLabel({ op: '+', value: 2 })).toBe('Defence: +2');
  });
});
