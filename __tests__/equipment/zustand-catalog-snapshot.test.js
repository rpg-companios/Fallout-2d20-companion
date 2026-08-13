import { describe, it, expect } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';

const resetItems = () => useCharacterStore.setState({ items: {} });
const storedItems = () => Object.values(useCharacterStore.getState().items);

describe('Zustand catalog snapshots', () => {
  it('stores catalog weapon fields when only weaponId is added', () => {
    resetItems();

    useCharacterStore.getState().addNewItem({ weaponId: 'weapon_10mm_pistol', quantity: 1 });

    const weapon = storedItems()[0];
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

  it('stores catalog ammo fields when only item id is added', () => {
    resetItems();

    useCharacterStore.getState().addNewItem({ id: 'ammo_10mm', quantity: 12 });

    const ammo = storedItems()[0];
    expect(ammo).toMatchObject({
      itemType: 'ammo',
      weaponId: 'ammo_10mm',
      quantity: 12,
    });
    expect(ammo.name).toBeTruthy();
    expect(ammo.cost).toBeTruthy();
    expect(ammo.rarity).toBeTruthy();
  });
});
