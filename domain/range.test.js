import { describe, it, expect } from 'vitest';
import {
  RANGE_ORDER, clampRangeIndex, rangeToIndex, indexToRangeName,
  rangeToName, shiftRange, resolveWeaponRangeFields,
} from './range.js';

describe('range scale', () => {
  it('order is Close→Medium→Long→Extreme', () => {
    expect(RANGE_ORDER).toEqual(['Close', 'Medium', 'Long', 'Extreme']);
  });

  it('letter codes map to indices', () => {
    expect(rangeToIndex('C')).toBe(0);
    expect(rangeToIndex('M')).toBe(1);
    expect(rangeToIndex('L')).toBe(2);
    expect(rangeToIndex('E')).toBe(3);
  });

  it('names map (case-insensitive) and empty → null', () => {
    expect(rangeToIndex('Medium')).toBe(1);
    expect(rangeToIndex('extreme')).toBe(3);
    expect(rangeToIndex('')).toBe(null);
    expect(rangeToIndex(null)).toBe(null);
  });

  it('handles legacy Parameter-shaped value', () => {
    expect(rangeToIndex({ base: 'M', total: 'L' })).toBe(2);
  });

  it('clamps out-of-range indices', () => {
    expect(clampRangeIndex(-5)).toBe(0);
    expect(clampRangeIndex(99)).toBe(3);
    expect(indexToRangeName(99)).toBe('Extreme');
  });
});

describe('shiftRange (mod steps stack additively, clamped)', () => {
  it('Medium + (3×+1 and 1×-1) = net +2 → Extreme', () => {
    // simulate stacking by summing steps first (as the modal does via rangeShift)
    const net = (+1) + (+1) + (+1) + (-1); // = +2
    expect(shiftRange('Medium', net).name).toBe('Extreme');
  });

  it('Long + (2×-1) = Close', () => {
    const net = (-1) + (-1);
    expect(shiftRange('Long', net).name).toBe('Close');
  });

  it('Close - 1 stays Close (lower clamp)', () => {
    expect(shiftRange('Close', -1).name).toBe('Close');
  });

  it('Extreme + 2 stays Extreme (upper clamp)', () => {
    expect(shiftRange('Extreme', 2).name).toBe('Extreme');
  });

  it('letter base works: C +2 → Long', () => {
    expect(shiftRange('C', 2).name).toBe('Long');
  });
});

describe('resolveWeaponRangeFields', () => {
  it('catalog letter C → index 0 / Close', () => {
    expect(resolveWeaponRangeFields({ range: 'C' })).toEqual({ range_index: 0, range_name: 'Close' });
  });
  it('prefers explicit range_index', () => {
    expect(resolveWeaponRangeFields({ range_index: 2, range: 'C' })).toEqual({ range_index: 2, range_name: 'Long' });
  });
  it('empty range → undefined fields', () => {
    expect(resolveWeaponRangeFields({ range: '' })).toEqual({ range_index: undefined, range_name: undefined });
  });
});
