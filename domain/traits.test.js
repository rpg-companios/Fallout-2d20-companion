import { describe, it, expect } from 'vitest';
import { findTraitByName } from './traits.js';

describe('findTraitByName', () => {
  it('finds a trait by id', () => {
    const trait = findTraitByName('brotherhood-chain-that-binds');
    expect(trait).toBeDefined();
    expect(trait.id).toBe('brotherhood-chain-that-binds');
  });

  it('returns undefined for a cyrillicName that no longer exists', () => {
    const trait = findTraitByName('Цепь, которая связывает');
    expect(trait).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(findTraitByName('')).toBeUndefined();
    expect(findTraitByName(null)).toBeUndefined();
    expect(findTraitByName(undefined)).toBeUndefined();
  });
});
