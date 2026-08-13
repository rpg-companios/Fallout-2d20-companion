import { describe, it, expect } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';

describe('Zustand weapon inventory snapshot', () => {
  it('stores catalog weapon fields when only weaponId is added', () => {
    const store = useCharacterStore;
    store.setState({ items: {} });

    store.getState().addNewItem({ weaponId: 'weapon_10mm_pistol', quantity: 1 });

    const weapon = Object.values(store.getState().items)[0];
    expect(weapon).toMatchObject({
      itemType: 'weapon',
      weaponId: 'weapon_10mm_pistol',
      ammoId: 'ammo_10mm',
    });
    expect(weapon.name).toBeTruthy();
    expect(weapon.weight).toBeTruthy();
    expect(weapon.cost).toBeTruthy();
    expect(weapon.rarity).toBeTruthy();
  });
});
