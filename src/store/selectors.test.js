import { describe, expect, test } from 'vitest';
import {
  selectItemsByEquipped,
  selectItemsByType,
  selectAttributeTotal,
  selectSkillTotal,
  getEquippedArmor,
  flattenItemParams,
  storeItemToWeaponDisplay,
  weaponModPatchToStore,
} from './selectors.js';
import { normalizeItemParameters } from './resolvers.js';

const mockState = {
  attributes: {
    STR: { id: 'STR', base: 5, modifiers: [{ source: 'perk', value: 1, operation: '+' }], total: 6 },
    END: { id: 'END', base: 4, modifiers: [], total: 4 },
  },
  skills: {
    'Стрельба из малых орудий': { id: 'Стрельба из малых орудий', base: 3, modifiers: [], total: 3 },
  },
  items: {
    pistol: { id: 'pistol', itemType: 'weapon', equipped: true, name: '10mm Pistol' },
    armor: { id: 'armor', itemType: 'armor', equipped: false, name: 'Leather Armor' },
    stimpak: { id: 'stimpak', itemType: 'chem', equipped: false, name: 'Stimpak', quantity: 5 },
  },
};

describe('selectItemsByEquipped', () => {
  test('returns equipped items when equipped=true', () => {
    const result = selectItemsByEquipped(mockState, true);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pistol');
  });

  test('returns unequipped items when equipped=false', () => {
    const result = selectItemsByEquipped(mockState, false);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id).sort()).toEqual(['armor', 'stimpak']);
  });

  test('returns empty array for empty items', () => {
    expect(selectItemsByEquipped({}, false)).toEqual([]);
  });
});

describe('selectItemsByType', () => {
  test('filters by itemType', () => {
    expect(selectItemsByType(mockState, 'weapon')).toHaveLength(1);
    expect(selectItemsByType(mockState, 'chem')).toHaveLength(1);
    expect(selectItemsByType(mockState, 'misc')).toHaveLength(0);
  });
});

describe('selectAttributeTotal', () => {
  test('returns total including modifiers', () => {
    expect(selectAttributeTotal(mockState, 'STR')).toBe(6);
    expect(selectAttributeTotal(mockState, 'END')).toBe(4);
    expect(selectAttributeTotal(mockState, 'PER')).toBe(0);
  });
});

describe('selectSkillTotal', () => {
  test('returns skill total', () => {
    expect(selectSkillTotal(mockState, 'Стрельба из малых орудий')).toBe(3);
    expect(selectSkillTotal(mockState, 'unknown')).toBe(0);
  });
});

describe('getEquippedArmor', () => {
  test('maps equipped armor and clothing to body slots', () => {
    const state = {
      items: {
        chest: {
          id: 'armor_leather_chest',
          itemType: 'armor',
          equipped: true,
          equipInstanceId: 'inst-1',
          protectedAreas: ['Body'],
          physicalDamageRating: { base: 10, modifiers: [], total: 10 },
        },
        suit: {
          id: 'clothing_vault_suit',
          itemType: 'clothing',
          equipped: true,
          equipInstanceId: 'inst-2',
          protectedAreas: ['Body'],
        },
      },
    };

    const armor = getEquippedArmor(state);
    expect(armor.body.armor?.id).toBe('armor_leather_chest');
    expect(armor.body.clothing?.id).toBe('clothing_vault_suit');
    expect(armor.head.armor).toBeNull();
  });
});

describe('flattenItemParams', () => {
  test('extracts totals from normalized parameters', () => {
    const item = {
      damage: { base: 10, modifiers: [{ source: 'mod', value: 2, operation: '+' }], total: 12 },
      fireRate: { base: 2, modifiers: [], total: 2 },
    };
    expect(flattenItemParams(item)).toEqual({
      damage: 12,
      fireRate: 2,
    });
  });
});

describe('storeItemToWeaponDisplay', () => {
  test('maps store fields to weapon card format', () => {
    const display = storeItemToWeaponDisplay({
      id: 'weapon_10mm_pistol',
      weaponId: 'weapon_10mm_pistol',
      itemType: 'weapon',
      equipped: true,
      damage: { base: 15, modifiers: [], total: 15 },
      fireRate: { base: 2, modifiers: [], total: 2 },
      weaponType: 'Light',
      range_name: 'Medium',
      qualities: '[{"qualityId":"Accurate"}]',
      damage_effects: 'Vicious',
      damage_type: 'physical',
      ammoId: 'ammo_10mm',
    });

    expect(display.id).toBe('weapon_10mm_pistol');
    expect(display.damage).toBe(15);
    expect(display.fire_rate).toBe(2);
    expect(display.weapon_type).toBe('Light');
    expect(display.range_name).toBe('Medium');
    expect(display.qualities).toBe('[{"qualityId":"Accurate"}]');
    expect(display.damage_effects).toBe('Vicious');
    expect(display.damage_type).toBe('physical');
    expect(display.ammoId).toBe('ammo_10mm');
  });
});

describe('weaponModPatchToStore', () => {
  test('preserves all mod-affected weapon fields for store update', () => {
    const patch = weaponModPatchToStore({
      name: 'Long 10mm Pistol',
      baseWeaponName: '10mm Pistol',
      damage: 18,
      fire_rate: 3,
      range_name: 'Long',
      qualities: '[{"qualityId":"Accurate"}]',
      damage_effects: 'Vicious; Spread',
      damage_type: 'physical',
      ammoId: 'ammo_10mm',
      weight: '3.5',
      cost: 120,
      appliedMods: { Receiver: 'mod_long_barrel' },
    });

    expect(patch.damage).toBe(18);
    expect(patch.fireRate).toBe(3);
    expect(patch.range_name).toBe('Long');
    expect(patch.rangeName).toBe('Long');
    expect(patch.qualities).toBe('[{"qualityId":"Accurate"}]');
    expect(patch.damage_effects).toBe('Vicious; Spread');
    expect(patch.damage_type).toBe('physical');
    expect(patch.ammoId).toBe('ammo_10mm');

    const normalized = normalizeItemParameters(patch);
    expect(normalized.damage.total).toBe(18);
    expect(normalized.fireRate.total).toBe(3);
  });
});

describe('real-time weapon updates', () => {
  test('equipped weapons are visible via selectItemsByEquipped', () => {
    const state = {
      items: {
        pistol: { id: 'weapon_10mm_pistol', itemType: 'weapon', equipped: true },
        knife: { id: 'weapon_knife', itemType: 'weapon', equipped: false },
      },
    };

    expect(selectItemsByEquipped(state, true).map((w) => w.id)).toEqual(['weapon_10mm_pistol']);
  });

  test('modified weapon stats are readable after flatten', () => {
    const state = {
      items: {
        pistol: {
          id: 'weapon_10mm_pistol',
          itemType: 'weapon',
          equipped: true,
          damage: { base: 15, modifiers: [{ source: 'mod_1', value: 3, operation: '+' }], total: 18 },
          fireRate: { base: 2, modifiers: [{ source: 'mod_2', value: 1, operation: '+' }], total: 3 },
          range_name: 'Long',
          qualities: '[{"qualityId":"Accurate"}]',
          damage_effects: 'Vicious',
          damage_type: 'energy',
          ammoId: 'ammo_10mm',
        },
      },
    };

    const weapon = storeItemToWeaponDisplay(selectItemsByEquipped(state, true)[0]);
    expect(weapon.damage).toBe(18);
    expect(weapon.fire_rate).toBe(3);
    expect(weapon.range_name).toBe('Long');
    expect(weapon.qualities).toBe('[{"qualityId":"Accurate"}]');
    expect(weapon.damage_effects).toBe('Vicious');
    expect(weapon.damage_type).toBe('energy');
    expect(weapon.ammoId).toBe('ammo_10mm');
  });
});
