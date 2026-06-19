import { describe, it, expect } from 'vitest';
import { getWeaponDamageBonus, getWeaponDamageBonusFromSources } from './traits.js';

describe('getWeaponDamageBonus', () => {
  const ncrInfantry = {
    modifiers: {
      weaponDamageBonus: [
        { weaponIds: ['weapon_10mm_pistol', 'weapon_submachine_gun'], bonus: 1 },
      ],
    },
  };

  it('returns matching bonus when weapon id is in weaponIds list', () => {
    expect(getWeaponDamageBonus(ncrInfantry, { id: 'weapon_10mm_pistol', mainSkill: 'SMALL_GUNS' })).toBe(1);
    expect(getWeaponDamageBonus(ncrInfantry, { id: 'weapon_submachine_gun', mainSkill: 'SMALL_GUNS' })).toBe(1);
  });

  it('returns 0 for weapons not in the list', () => {
    expect(getWeaponDamageBonus(ncrInfantry, { id: 'weapon_laser_rifle', mainSkill: 'ENERGY_WEAPONS' })).toBe(0);
  });

  it('supports weaponId as a single id (not array)', () => {
    const trait = { modifiers: { weaponDamageBonus: [{ weaponId: 'weapon_specific', bonus: 2 }] } };
    expect(getWeaponDamageBonus(trait, { id: 'weapon_specific', mainSkill: 'SMALL_GUNS' })).toBe(2);
    expect(getWeaponDamageBonus(trait, { id: 'weapon_other', mainSkill: 'SMALL_GUNS' })).toBe(0);
  });

  it('matches weapons by skillKey (UPPER_SNAKE_CASE)', () => {
    const trait = { modifiers: { weaponDamageBonus: [{ skillKey: 'BIG_GUNS', bonus: -1 }] } };
    expect(getWeaponDamageBonus(trait, { id: 'weapon_minigun', mainSkill: 'BIG_GUNS' })).toBe(-1);
    expect(getWeaponDamageBonus(trait, { id: 'weapon_laser_gun', mainSkill: 'ENERGY_WEAPONS' })).toBe(0);
  });

  it('sums multiple matching rules', () => {
    const trait = {
      modifiers: {
        weaponDamageBonus: [
          { weaponIds: ['weapon_a'], bonus: 2 },
          { weaponIds: ['weapon_a', 'weapon_b'], bonus: -1 },
        ],
      },
    };
    expect(getWeaponDamageBonus(trait, { id: 'weapon_a', mainSkill: 'SMALL_GUNS' })).toBe(1); // 2 + (-1)
    expect(getWeaponDamageBonus(trait, { id: 'weapon_b', mainSkill: 'SMALL_GUNS' })).toBe(-1);
  });

  it('returns 0 for missing/empty inputs', () => {
    expect(getWeaponDamageBonus(null, { id: 'x' })).toBe(0);
    expect(getWeaponDamageBonus({}, { id: 'x' })).toBe(0);
    expect(getWeaponDamageBonus({ modifiers: {} }, { id: 'x' })).toBe(0);
    expect(getWeaponDamageBonus({ modifiers: { weaponDamageBonus: [] } }, { id: 'x' })).toBe(0);
  });

  it('returns 0 when neither weaponIds nor skillKey match', () => {
    const trait = { modifiers: { weaponDamageBonus: [{ weaponIds: ['weapon_x'], bonus: 5 }] } };
    expect(getWeaponDamageBonus(trait, { id: 'weapon_y', mainSkill: 'SMALL_GUNS' })).toBe(0);
  });
});

describe('getWeaponDamageBonusFromSources (universal: trait + perk + chem)', () => {
  it('sums bonuses from multiple sources', () => {
    const trait = { modifiers: { weaponDamageBonus: [{ weaponIds: ['weapon_a'], bonus: 1 }] } };
    const perk = { modifiers: { weaponDamageBonus: [{ weaponIds: ['weapon_a'], bonus: 2 }] } };
    const chem = { modifiers: { weaponDamageBonus: [{ weaponIds: ['weapon_a'], bonus: -1 }] } };
    expect(getWeaponDamageBonusFromSources([trait, perk, chem], { id: 'weapon_a' })).toBe(2); // 1 + 2 - 1
  });

  it('returns 0 with empty sources array', () => {
    expect(getWeaponDamageBonusFromSources([], { id: 'x' })).toBe(0);
  });
});

describe('weaponDamageBonus on actual NCR traits', () => {
  // Per owner's design: ncr-resident is a MULTI-TRAIT CONTAINER with no
  // mechanical effect of its own. Only the chosen sub-traits (e.g.
  // ncr-infantryman) carry numeric bonuses. An earlier test that asserted
  // a self-bonus on ncr-resident has been removed.

  it('ncr-infantryman has its own weaponDamageBonus', async () => {
    const traits = (await import('../data/traits/traits.json')).default;
    const ncrInfantryman = traits.find((t) => t.id === 'ncr-infantryman');
    expect(ncrInfantryman.modifiers.weaponDamageBonus).toBeDefined();
    expect(Array.isArray(ncrInfantryman.modifiers.weaponDamageBonus)).toBe(true);
    // No legacy ncrInfantryWeaponIds
    expect(ncrInfantryman.modifiers.ncrInfantryWeaponIds).toBeUndefined();
  });
});
