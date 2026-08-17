import { describe, expect, it, vi } from 'vitest';
import { enrichWeaponItem } from '../../domain/enrichItem';

describe('weapon quality-name callback contract', () => {
  it('passes only the quality id to unary quality-name resolvers', () => {
    const qualityNameById = vi.fn((id) => `name:${id}`);
    const catalog = {
      weapons: [{ id: 'weapon_test', name: 'Test weapon' }],
      weaponMods: [],
    };

    const item = enrichWeaponItem({
      weaponId: 'weapon_test',
      uniqQualities: ['first', 'second'],
    }, catalog, { qualityNameById });

    expect(qualityNameById).toHaveBeenNthCalledWith(1, 'first');
    expect(qualityNameById).toHaveBeenNthCalledWith(2, 'second');
    expect(item.name).toBe('name:first name:second Test weapon');
  });
});
