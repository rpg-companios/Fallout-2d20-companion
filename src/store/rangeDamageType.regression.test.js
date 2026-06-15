import { describe, it, expect, beforeEach } from 'vitest';
import useCharacterStore from './characterStore.js';
import { selectItemsByEquipped, storeItemToWeaponDisplay, flattenItemParams } from './selectors.js';

const reset = () => useCharacterStore.setState({ items: {} });

describe('range / damageType are plain values (React #31 regression)', () => {
  beforeEach(reset);

  it('preserves string range and damageType (not corrupted to 0/object)', () => {
    const store = useCharacterStore.getState();
    store.addNewItem({
      weaponId: 'weapon_laser_rifle',
      name: 'Laser Rifle',
      itemType: 'weapon',
      damage: 5,
      fireRate: 2,
      range: 'Medium',
      damageType: 'Energy',
      equipped: true,
    });

    const item = selectItemsByEquipped(useCharacterStore.getState(), true)[0];

    // range / damageType must stay strings, NOT {base,modifiers,total} objects
    expect(typeof item.range).toBe('string');
    expect(item.range).toBe('Medium');
    expect(typeof item.damageType).toBe('string');
    expect(item.damageType).toBe('Energy');

    // numeric params remain Parameter objects
    expect(item.damage).toMatchObject({ total: 5 });

    // display mapping yields renderable primitives (no objects → no React #31)
    const display = storeItemToWeaponDisplay(item);
    expect(['string', 'number', 'undefined']).toContain(typeof display.range);
    expect(['string', 'number', 'undefined']).toContain(typeof display.damage_type);

    // flattenItemParams must not leave any Parameter object on common fields
    const flat = flattenItemParams(item);
    for (const f of ['damage', 'fireRate', 'range', 'damageType']) {
      expect(typeof flat[f] === 'object' && flat[f] !== null && 'total' in flat[f]).toBe(false);
    }
  });
});
