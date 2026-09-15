// Шаг 6 миграции: условия (conditions), журнал доз препаратов (chemDosesLog),
// момент последней проверки «Сопротивляться» (lastDiseaseResistAt) и состояния
// проверок риска сцен (sceneRiskStates) — в characterStore. Единственный
// источник — стор; фасад useCharacter() эти поля (и их сеттеры) больше не
// отдаёт, экраны читают стор напрямую (WeaponsAndArmorScreen:
// lastDiseaseResistAt). Сеттеры поддерживают функциональный апдейтер
// (прецедент setEquippedWeapons).
//
// Тень activeTimedEffects удалена (решение владельца, вариант А): канон —
// словарь effects стора, массив для сейва — денормализация (denormalizeEffects).

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс условий/доз/болезней/рисков (Шаг 6)', () => {
  it('начальные значения: пустые списки, null, пустые состояния сцен', () => {
    const state = useCharacterStore.getState();
    expect(state.conditions).toEqual([]);
    expect(state.chemDosesLog).toEqual([]);
    expect(state.lastDiseaseResistAt).toBeNull();
    expect(state.sceneRiskStates).toEqual({});
  });

  it('setConditions: прямой сет и функциональный апдейтер (добавить/убрать)', () => {
    const store = useCharacterStore.getState();
    store.setConditions(['addicted']);
    store.setConditions((prev) => (prev.includes('diseased') ? prev : [...prev, 'diseased']));
    expect(useCharacterStore.getState().conditions).toEqual(['addicted', 'diseased']);
    store.setConditions((prev) => prev.filter((c) => c !== 'addicted'));
    expect(useCharacterStore.getState().conditions).toEqual(['diseased']);
  });

  it('setChemDosesLog: прямой сет и функциональный апдейтер (запись дозы)', () => {
    const store = useCharacterStore.getState();
    const dose = { chemId: 'psycho', takenAt: 1000 };
    store.setChemDosesLog([dose]);
    store.setChemDosesLog((prev) => [...prev, { chemId: 'med-x', takenAt: 2000 }]);
    expect(useCharacterStore.getState().chemDosesLog).toEqual([
      dose,
      { chemId: 'med-x', takenAt: 2000 },
    ]);
  });

  it('setLastDiseaseResistAt: timestamp и сброс в null', () => {
    const store = useCharacterStore.getState();
    store.setLastDiseaseResistAt(1726000000000);
    expect(useCharacterStore.getState().lastDiseaseResistAt).toBe(1726000000000);
    store.setLastDiseaseResistAt(null);
    expect(useCharacterStore.getState().lastDiseaseResistAt).toBeNull();
  });

  it('setSceneRiskStates: прямой сет и функциональный апдейтер (resolveEvent)', () => {
    const store = useCharacterStore.getState();
    store.setSceneRiskStates({ sleepOnGround: { progress: 1 } });
    store.setSceneRiskStates((prev) => ({
      ...prev,
      drinkDirtyWater: { progress: 2 },
    }));
    expect(useCharacterStore.getState().sceneRiskStates).toEqual({
      sleepOnGround: { progress: 1 },
      drinkDirtyWater: { progress: 2 },
    });
  });

  it('поля входят в partialize (переживают rehydrate)', async () => {
    const store = useCharacterStore.getState();
    store.setConditions(['diseased']);
    store.setChemDosesLog([{ chemId: 'psycho', takenAt: 1 }]);
    store.setLastDiseaseResistAt(42);
    store.setSceneRiskStates({ sleepOnGround: { progress: 3 } });
    await useCharacterStore.persist.rehydrate();
    const state = useCharacterStore.getState();
    expect(state.conditions).toEqual(['diseased']);
    expect(state.chemDosesLog).toEqual([{ chemId: 'psycho', takenAt: 1 }]);
    expect(state.lastDiseaseResistAt).toBe(42);
    expect(state.sceneRiskStates).toEqual({ sleepOnGround: { progress: 3 } });
  });

  it('resetCharacterStore сбрасывает все четыре поля', () => {
    const store = useCharacterStore.getState();
    store.setConditions(['addicted']);
    store.setChemDosesLog([{ chemId: 'psycho', takenAt: 1 }]);
    store.setLastDiseaseResistAt(42);
    store.setSceneRiskStates({ sleepOnGround: { progress: 1 } });
    store.resetCharacterStore();
    const state = useCharacterStore.getState();
    expect(state.conditions).toEqual([]);
    expect(state.chemDosesLog).toEqual([]);
    expect(state.lastDiseaseResistAt).toBeNull();
    expect(state.sceneRiskStates).toEqual({});
    // Инвариант Шага 5 не задет: атрибуты/навыки сеются дефолтами.
    expect(Object.keys(state.attributes).length).toBe(7);
  });
});
