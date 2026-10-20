// Shared character-store slice: generic conditions and scene-risk state.
// Setting-owned disease logs and cooldown timestamps live in stateExtensions.

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: shared conditions and scene risks', () => {
  it('initializes generic condition and scene-risk collections', () => {
    const state = useCharacterStore.getState();
    expect(state.conditions).toEqual([]);
    expect(state.sceneRiskStates).toEqual({});
  });

  it('setConditions supports direct and functional updates', () => {
    const store = useCharacterStore.getState();
    store.setConditions(['addicted']);
    store.setConditions((previous) => (
      previous.includes('diseased') ? previous : [...previous, 'diseased']
    ));
    expect(useCharacterStore.getState().conditions).toEqual(['addicted', 'diseased']);
    store.setConditions((previous) => previous.filter((condition) => condition !== 'addicted'));
    expect(useCharacterStore.getState().conditions).toEqual(['diseased']);
  });

  it('setSceneRiskStates supports direct and functional updates', () => {
    const store = useCharacterStore.getState();
    store.setSceneRiskStates({ sleepOnGround: { progress: 1 } });
    store.setSceneRiskStates((previous) => ({
      ...previous,
      drinkDirtyWater: { progress: 2 },
    }));
    expect(useCharacterStore.getState().sceneRiskStates).toEqual({
      sleepOnGround: { progress: 1 },
      drinkDirtyWater: { progress: 2 },
    });
  });

  it('persists and resets the shared condition/risk fields', async () => {
    const store = useCharacterStore.getState();
    store.setConditions(['diseased']);
    store.setSceneRiskStates({ sleepOnGround: { progress: 3 } });
    await useCharacterStore.persist.rehydrate();
    let state = useCharacterStore.getState();
    expect(state.conditions).toEqual(['diseased']);
    expect(state.sceneRiskStates).toEqual({ sleepOnGround: { progress: 3 } });

    state.resetCharacterStore();
    state = useCharacterStore.getState();
    expect(state.conditions).toEqual([]);
    expect(state.sceneRiskStates).toEqual({});
    expect(Object.keys(state.attributes).length).toBe(7);
  });
});
