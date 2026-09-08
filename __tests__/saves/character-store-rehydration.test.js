import { afterEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const equippedWeapon = {
  id: '10mm-pistol',
  weaponId: '10mm-pistol',
  equipped: true,
  damage: { base: 4, modifiers: [], total: 4 },
  fireRate: { base: 2, modifiers: [], total: 2 },
};

afterEach(async () => {
  await useCharacterStore.persist.clearStorage();
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: PWA rehydration', () => {
  it('rehydrates survival extensions and equipped gear before the app mounts', async () => {
    const current = useCharacterStore.getState();
    await AsyncStorage.setItem('character-store', JSON.stringify({
      state: {
        attributes: current.attributes,
        skills: current.skills,
        items: { '10mm-pistol': equippedWeapon },
        effects: {},
        selectedPerks: [],
        rewardedSkills: [],
        robot: current.robot,
        stateExtensions: {
          survival: {
            enabled: true,
            food: 4,
            water: 3,
            sleep: 2,
          },
        },
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      version: CURRENT_SCHEMA_VERSION,
    }));

    await useCharacterStore.persist.rehydrate();

    const hydrated = useCharacterStore.getState();
    expect(hydrated.items['10mm-pistol'].equipped).toBe(true);
    expect(hydrated.items['10mm-pistol'].damage.total).toBe(4);
    expect(hydrated.stateExtensions.survival).toEqual({
      enabled: true,
      food: 4,
      water: 3,
      sleep: 2,
    });
  });
});