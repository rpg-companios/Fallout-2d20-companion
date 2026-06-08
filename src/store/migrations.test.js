// src/store/migrations.test.js
// Tests for migration functions (normalizeCharacterState, denormalizeCharacterState)

import { describe, expect, test } from 'vitest';
import { 
  normalizeCharacterState, 
  denormalizeForSave,
  normalizeForStore 
} from './migrations.js';

describe('normalizeCharacterState', () => {
  test('should normalize empty data', () => {
    const result = normalizeCharacterState({});
    
    expect(result).toEqual({
      attributes: {},
      skills: {},
      items: {},
      effects: {},
      schemaVersion: 1,
    });
  });
  
  test('should normalize attributes from array format', () => {
    const data = {
      attributes: [
        { name: 'STR', value: 5 },
        { name: 'AGI', value: 7 },
        { name: 'END', value: 6 },
      ],
    };
    
    const result = normalizeCharacterState(data);
    
    expect(result.attributes).toEqual({
      STR: { id: 'STR', base: 5, modifiers: [], total: 5 },
      AGI: { id: 'AGI', base: 7, modifiers: [], total: 7 },
      END: { id: 'END', base: 6, modifiers: [], total: 6 },
    });
    expect(result.schemaVersion).toBe(1);
  });
  
  test('should normalize skills from array format', () => {
    const data = {
      skills: [
        { name: 'SMALL_GUNS', value: 3 },
        { name: 'MEDICINE', value: 5 },
      ],
    };
    
    const result = normalizeCharacterState(data);
    
    expect(result.skills).toEqual({
      SMALL_GUNS: { id: 'SMALL_GUNS', base: 3, modifiers: [], total: 3 },
      MEDICINE: { id: 'MEDICINE', base: 5, modifiers: [], total: 5 },
    });
    expect(result.schemaVersion).toBe(1);
  });
  
  test('should normalize items from equipment and equippedWeapons', () => {
    const data = {
      equipment: {
        items: [
          { id: 'armor_leather_chest_001', name: 'Leather Chest Piece', itemType: 'armor', physicalDamageRating: 10 },
          { id: 'chem_stimpak', name: 'Stimpak', itemType: 'chem', quantity: 5 },
        ],
      },
      equippedWeapons: [
        { id: 'weapon_10mm_pistol', name: '10mm Pistol', itemType: 'weapon', damage: 15 },
      ],
    };
    
    const result = normalizeCharacterState(data);
    
    // Verify all items are normalized with human-readable IDs from catalog
    expect(result.items['armor_leather_chest_001']).toEqual({
      id: 'armor_leather_chest_001',
      name: 'Leather Chest Piece',
      itemType: 'armor',
      physicalDamageRating: { base: 10, modifiers: [], total: 10 },
      equipped: false,
    });
    
    expect(result.items['chem_stimpak']).toEqual({
      id: 'chem_stimpak',
      name: 'Stimpak',
      itemType: 'chem',
      quantity: 5,
      equipped: false,
    });
    
    // The weapon should have normalized damage and human-readable ID from catalog
    expect(result.items['weapon_10mm_pistol'].id).toBe('weapon_10mm_pistol');
    expect(result.items['weapon_10mm_pistol'].name).toBe('10mm Pistol');
    expect(result.items['weapon_10mm_pistol'].damage).toEqual({ base: 15, modifiers: [], total: 15 });
    expect(result.items['weapon_10mm_pistol'].equipped).toBe(true);
    
    expect(result.schemaVersion).toBe(1);
  });
  
  test('should normalize timed effects', () => {
    const data = {
      activeTimedEffects: [
        {
          id: 'stimpak-1',
          effectName: 'Stimpak',
          effectLabel: 'Stimpak',
          effectKind: 'positive',
          scenesLeft: 3,
        },
      ],
    };
    
    const result = normalizeCharacterState(data);
    
    expect(result.effects).toEqual({
      'stimpak-1': {
        id: 'stimpak-1',
        name: 'Stimpak',
        type: 'positive',
        active: true,
        parameters: [],
        scenesLeft: 3,
      },
    });
    expect(result.schemaVersion).toBe(1);
  });
  
  test('should handle mixed equipped items (equipped from equipment.items)', () => {
    const data = {
      equipment: {
        items: [
          { id: 'weapon_10mm_pistol', name: 'Equipped Pistol', itemType: 'weapon', equipped: true },
        ],
      },
      equippedWeapons: [],
    };
    
    const result = normalizeCharacterState(data);
    
    expect(result.items['weapon_10mm_pistol'].equipped).toBe(true);
  });
});

describe('denormalizeForSave', () => {
  test('should denormalize to empty arrays', () => {
    const storeState = {
      attributes: {},
      skills: {},
      items: {},
      effects: {},
    };
    
    const result = denormalizeForSave(storeState);
    
    expect(result).toEqual({
      attributes: [],
      skills: [],
      equipment: { items: [] },
      equippedWeapons: [],
      activeTimedEffects: [],
    });
  });
  
  test('should denormalize attributes to array format', () => {
    const storeState = {
      attributes: {
        STR: { id: 'STR', base: 5, modifiers: [], total: 5 },
        AGI: { id: 'AGI', base: 7, modifiers: [], total: 7 },
      },
      skills: {},
      items: {},
      effects: {},
    };
    
    const result = denormalizeForSave(storeState);
    
    expect(result.attributes).toEqual([
      { name: 'STR', value: 5 },
      { name: 'AGI', value: 7 },
    ]);
  });
  
  test('should denormalize items to separate equipment and equippedWeapons', () => {
    const storeState = {
      attributes: {},
      skills: {},
      items: {
        'armor_leather_chest_001': { id: 'armor_leather_chest_001', name: 'Leather Chest Piece', itemType: 'armor', equipped: false },
        'weapon_10mm_pistol': { id: 'weapon_10mm_pistol', name: '10mm Pistol', itemType: 'weapon', equipped: true },
        'chem_stimpak': { id: 'chem_stimpak', name: 'Stimpak', itemType: 'chem', equipped: false },
      },
      effects: {},
    };
    
    const result = denormalizeForSave(storeState);
    
    expect(result.equipment.items).toEqual([
      { id: 'armor_leather_chest_001', name: 'Leather Chest Piece', itemType: 'armor', equipped: false },
      { id: 'chem_stimpak', name: 'Stimpak', itemType: 'chem', equipped: false },
    ]);
    expect(result.equippedWeapons).toEqual([
      { id: 'weapon_10mm_pistol', name: '10mm Pistol', itemType: 'weapon', equipped: true },
    ]);
  });
  
  test('should denormalize effects to activeTimedEffects array', () => {
    const storeState = {
      attributes: {},
      skills: {},
      items: {},
      effects: {
        'stimpak-1': {
          id: 'stimpak-1',
          name: 'Stimpak',
          type: 'positive',
          active: true,
          scenesLeft: 3,
        },
        'expired-effect': {
          id: 'expired-effect',
          name: 'Expired',
          type: 'positive',
          active: false,
        },
      },
    };
    
    const result = denormalizeForSave(storeState);
    
    expect(result.activeTimedEffects).toEqual([
      {
        id: 'stimpak-1',
        effectName: 'Stimpak',
        effectLabel: 'Stimpak',
        effectKind: 'positive',
        scenesLeft: 3,
      },
    ]);
  });
});

describe('round-trip migration', () => {
  test('should preserve data through normalize and denormalize', () => {
    const originalData = {
      attributes: [
        { name: 'STR', value: 5 },
        { name: 'AGI', value: 7 },
      ],
      skills: [
        { name: 'SMALL_GUNS', value: 3 },
      ],
      equipment: {
        items: [
          { id: 'armor_leather_chest_001', name: 'Leather Chest Piece', itemType: 'armor', equipped: false },
        ],
      },
      equippedWeapons: [
        { id: 'weapon_10mm_pistol', name: '10mm Pistol', itemType: 'weapon', damage: 15 },
      ],
      activeTimedEffects: [
        {
          id: 'stimpak-1',
          effectName: 'Stimpak',
          effectLabel: 'Stimpak',
          effectKind: 'positive',
          scenesLeft: 3,
        },
      ],
    };
    
    // Normalize
    const normalized = normalizeCharacterState(originalData);
    
    // Denormalize
    const denormalized = denormalizeForSave(normalized);
    
    // Verify key properties
    expect(denormalized.attributes).toHaveLength(2);
    expect(denormalized.skills).toHaveLength(1);
    expect(denormalized.equipment.items).toHaveLength(1);
    expect(denormalized.equippedWeapons).toHaveLength(1);
    expect(denormalized.activeTimedEffects).toHaveLength(1);
  });
});
