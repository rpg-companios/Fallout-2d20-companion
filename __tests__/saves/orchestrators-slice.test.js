// Патч 240: полный конвейер расходника (applyConsumableFull), семейство
// болезней (applyDiseaseExposureEvent / reducePersistentDiseaseRanks /
// resistDisease) и мост времени (advanceEffectsByGameHours) — стор
// (orchestratorsSlice). Реакты случайных бросков не проверяем — проверяем
// формы результатов, кулдауны, влияние на состояние (условия/эффекты/журнал).

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { legacyEffectToStore } from '../../src/store/effectsSync';

const diseaseEffect = (conditionId, rank = 2) => ({
  ...legacyEffectToStore({
    id: `disease-${conditionId}`,
    effectName: 'Микробы',
    effectLabel: 'Болезнь',
    effectKind: 'negative',
    effectType: 'disease',
    conditionId,
    isPermanent: true,
  }),
  rank,
});

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('orchestratorsSlice: болезни (патч 240)', () => {
  it('reducePersistentDiseaseRanks: лечит все болезни на N, снимает условие при полном излечении', () => {
    useCharacterStore.setState({
      effects: { d1: diseaseEffect('bone_worms', 1) },
      conditions: ['diseased'],
    });
    const result = useCharacterStore.getState().reducePersistentDiseaseRanks(1);
    expect(result.healed).toEqual(['bone_worms']);
    expect(result.diseasesLeft).toBe(0);
    expect(useCharacterStore.getState().conditions).not.toContain('diseased');
    // syncTimedEffectsToStore гасит эффект (active:false), не удаляет запись.
    expect(useCharacterStore.getState().effects.d1.active).toBe(false);
  });

  it('reducePersistentDiseaseRanks: частичное лечение сохраняет условие', () => {
    useCharacterStore.setState({
      effects: {
        d1: diseaseEffect('bone_worms', 3),
        d2: diseaseEffect('rot_lung', 1),
      },
      conditions: ['diseased'],
    });
    const result = useCharacterStore.getState().reducePersistentDiseaseRanks(1);
    expect(result.healed).toEqual(['rot_lung']);
    expect(result.diseasesLeft).toBe(1);
    expect(useCharacterStore.getState().conditions).toContain('diseased');
  });

  it('resistDisease: нет болезни — notFound; кулдаун второй попытки в сутки', () => {
    const store = useCharacterStore.getState();
    expect(store.resistDisease('missing')).toEqual({ ok: false, reason: 'notFound' });
    useCharacterStore.setState({ effects: { d1: diseaseEffect('bone_worms', 1) } });
    const first = useCharacterStore.getState().resistDisease('bone_worms');
    expect(first.ok).toBe(true);
    expect(first.rankBefore).toBe(1);
    const second = useCharacterStore.getState().resistDisease('bone_worms');
    expect(second).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(second.retryInMs).toBeGreaterThan(0);
  });

  it('applyDiseaseExposureEvent: неизвестное событие — null, без выбросов', () => {
    expect(useCharacterStore.getState().applyDiseaseExposureEvent('no_such_event')).toBeNull();
  });
});

describe('orchestratorsSlice: расходник и мост времени (патч 240)', () => {
  it('applyConsumableFull: лечит от текущего ОЗ и возвращает полные результаты', () => {
    const store = useCharacterStore.getState();
    store.setBaseAttributes([
      { name: 'END', value: 5 },
      { name: 'LCK', value: 4 },
    ]);
    store.setCurrentHealth(3);
    // Поле мгновенного лечения по контракту домена — hpHealed.
    const result = store.applyConsumableFull({ id: 'stimpak', itemType: 'consumable', hpHealed: 5 });
    expect(useCharacterStore.getState().currentHealth).toBe(8); // до потолка 9
    expect(result.healAmount).toBeGreaterThan(0);
    expect(result.radiationAmount === null || typeof result.radiationAmount === 'number').toBe(true);
    expect(result.addictionResult).toBeNull();
  });

  it('applyConsumableFull: журнал доз растёт для химии (пул за 24 ч)', () => {
    const store = useCharacterStore.getState();
    store.applyConsumableFull({ id: 'chem_psycho', itemType: 'chem' });
    expect(useCharacterStore.getState().chemDosesLog.length).toBe(1);
    // Зависимость возможна: уровень > 0 и негативный эффект (бросок кубиков
    // случаен — проверяем только форму результата).
    const doses = useCharacterStore.getState().applyConsumableFull({
      id: 'chem_psycho', itemType: 'chem', addictionLevel: 1, negativeEffect: 'addiction',
    });
    expect(useCharacterStore.getState().chemDosesLog.length).toBe(2);
    expect(doses.addictionResult).not.toBeNull();
    expect(doses.addictionResult).toHaveProperty('addicted');
  });

  it('advanceEffectsByGameHours: часы сна двигают таймеры и гасят истёкшие', () => {
    useCharacterStore.setState({
      effects: { e1: legacyEffectToStore({ id: 'e1', effectName: 'Психо', effectKind: 'positive', scenesLeft: 30 }) },
    });
    const { expired } = useCharacterStore.getState().advanceEffectsByGameHours(3); // 36 сцен
    expect(expired.some((effect) => effect.id === 'e1')).toBe(true);
    expect(useCharacterStore.getState().effects.e1.active).toBe(false);
  });

  it('экшены в сторе, в фасаде их нет (AST — step8a-3-facade)', () => {
    const store = useCharacterStore.getState();
    for (const action of ['applyConsumableFull', 'applyDiseaseExposureEvent', 'reducePersistentDiseaseRanks', 'resistDisease', 'advanceEffectsByGameHours']) {
      expect(store[action]).toBeTypeOf('function');
    }
  });
});
