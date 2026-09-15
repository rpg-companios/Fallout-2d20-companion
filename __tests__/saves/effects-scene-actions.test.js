// Патч 239: advanceScene / applyConsumableTimedEffects / previewConsumableRadiation
// переехали из CharacterContext в стор (тиковые операции над словарём effects).
// advanceScene тестируется функционально (эффект с scenesLeft=1 истекает,
// счётчик сцен растёт); превью радиации — по форме результата и клампу
// «полученной» радиации от текущего значения счётчика.

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { legacyEffectToStore } from '../../src/store/effectsSync';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: сцены и расходники (патч 239)', () => {
  it('advanceScene: эффект с scenesLeft=1 истекает, счётчик сцен растёт', () => {
    useCharacterStore.setState({
      effects: {
        e1: legacyEffectToStore({ id: 'e1', effectName: 'Психо', effectKind: 'positive', scenesLeft: 1 }),
        e2: legacyEffectToStore({ id: 'e2', effectName: 'Ментат', effectKind: 'positive', scenesLeft: 3 }),
      },
    });
    const result = useCharacterStore.getState().advanceScene();
    expect(result.expired.some((effect) => effect.id === 'e1')).toBe(true);
    // expireEffect не удаляет, а помечает active:false (так было и в контексте).
    expect(useCharacterStore.getState().effects.e2.active).toBe(true);
    expect(useCharacterStore.getState().effects.e1.active).toBe(false);
    expect(useCharacterStore.getState().sceneCounter).toBe(1);
    // Вторая сцена: счётчик продолжает расти.
    useCharacterStore.getState().advanceScene();
    expect(useCharacterStore.getState().sceneCounter).toBe(2);
  });

  it('applyConsumableTimedEffects: предмет без эффектов — пустой результат, истёкшие гасятся', () => {
    useCharacterStore.setState({
      effects: {
        e1: legacyEffectToStore({ id: 'e1', effectName: 'Просрочка', effectKind: 'positive', scenesLeft: 0 }),
      },
    });
    const result = useCharacterStore.getState().applyConsumableTimedEffects({ id: 'chem_x' });
    expect(Array.isArray(result.effects)).toBe(true);
    expect(Array.isArray(result.expired)).toBe(true);
    expect(result.expired.some((effect) => effect.id === 'e1')).toBe(true);
  });

  it('previewConsumableRadiation: форма результата, без переброса у обычного предмета', () => {
    const preview = useCharacterStore.getState().previewConsumableRadiation({ id: 'water_pure' });
    expect(Object.hasOwn(preview, 'requestedAmount')).toBe(true);
    expect(Object.hasOwn(preview, 'receivedRadiationDamage')).toBe(true);
    expect(typeof preview.receivedRadiationDamage).toBe('number');
    expect(preview.receivedRadiationDamage).toBeGreaterThanOrEqual(0);
    expect(preview.canOfferReroll).toBe(false); // предмет не irradiated
  });

  it('экшены присутствуют в сторе, а в фасаде их нет (AST — step8a-3-facade)', () => {
    const store = useCharacterStore.getState();
    expect(store.advanceScene).toBeTypeOf('function');
    expect(store.applyConsumableTimedEffects).toBeTypeOf('function');
    expect(store.previewConsumableRadiation).toBeTypeOf('function');
  });
});
