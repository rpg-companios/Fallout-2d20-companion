// ПРИЁМОЧНЫЙ (патч 317): каскад производных — МК-3, шаг 2.
// Любое действие, меняющее вход пересчёта, обновляет derivedStats САМО,
// синхронно. Ни один тест ниже НЕ вызывает recalculateDerivedStats вручную —
// это и есть суть шага: ручные вызовы удалены из действий (26 штук).
import { afterEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('МК-3 шаг 2: каскад производных в хранилище', () => {
  it('атрибут меняется действием → инициатива и ОЗ пересчитались сами', () => {
    const store = useCharacterStore.getState();
    const before = store.derivedStats;
    store.updateAttribute('PER', 2);
    const after = useCharacterStore.getState().derivedStats;
    expect(after.initiative.total).toBe(before.initiative.total + 2);
    store.updateAttribute('END', 2);
    expect(useCharacterStore.getState().derivedStats.maxHealth.total).toBe(
      before.maxHealth.total + 2,
    );
  });

  it('таймер-эффект добавился/истёк действием → модификаторы ОЗ живут сами', () => {
    const store = useCharacterStore.getState();
    const base = store.derivedStats.maxHealth.total;
    store.addEffect({
      id: 'test_buff',
      effectKind: 'positive',
      maxHpModifier: { value: 3, op: '+' },
    });
    const withEffect = useCharacterStore.getState().derivedStats;
    expect(withEffect.maxHealth.total).toBe(base + 3);
    expect(withEffect.maxHealth.modifiers).toEqual([
      { source: 'timedEffects', value: 3, operation: '+' },
    ]);
    store.expireEffect('test_buff');
    expect(useCharacterStore.getState().derivedStats.maxHealth.total).toBe(base);
  });

  it('перк взят действием → perkBonuses и ОЗ пересчитались сами', () => {
    const store = useCharacterStore.getState();
    const base = store.derivedStats.maxHealth.total;
    store.setSelectedPerks([{ perkId: 'lifeGiver', index: 0 }]);
    const state = useCharacterStore.getState();
    // lifeGiver: +ВЫН×ранг к ОЗ — бонус пришёл через perkBonuses, каскад подхватил.
    expect(state.perkBonuses.maxHealthBonus).toBeGreaterThan(0);
    expect(state.derivedStats.maxHealth.total).toBe(
      base + state.perkBonuses.maxHealthBonus,
    );
    expect(state.derivedStats.maxHealth.modifiers).toEqual([
      { source: 'perks', value: state.perkBonuses.maxHealthBonus, operation: '+' },
    ]);
  });

  it('робо-слоты изменились действием → derivedStats пересчитались сами', () => {
    const store = useCharacterStore.getState();
    const before = store.derivedStats;
    store.initRobot('protectron');
    store.setEquippedRobotSlots({ body: { limb: { id: 'body1', carryWeight: 42 } } });
    const after = useCharacterStore.getState().derivedStats;
    expect(after).not.toBe(before); // каскад сработал от смены robot.slots
  });

  it('зеркало экипировки (setCharacterContext) → грузоподъёмность сама', () => {
    const store = useCharacterStore.getState();
    const base = store.derivedStats.carryWeight.total;
    store.setCharacterContext({
      equipmentState: {
        equippedArmor: { torso: { armor: { carryWeightModifier: 5 } } },
      },
    });
    expect(useCharacterStore.getState().derivedStats.carryWeight.total).toBe(base + 5);
  });

  it('ручной форс-пересчёт (публичный API) продолжает работать', () => {
    const store = useCharacterStore.getState();
    store.updateAttribute('AGI', 1);
    const snapshot = useCharacterStore.getState().derivedStats;
    store.recalculateDerivedStats();
    // Тот же результат: форс-точка и каскад считают одной функцией.
    expect(useCharacterStore.getState().derivedStats).toEqual(snapshot);
  });

  it('каскад не зацикливается: серия действий завершается синхронно', () => {
    const store = useCharacterStore.getState();
    for (let i = 0; i < 20; i += 1) {
      store.updateAttribute('STR', 0); // «пустое» изменение того же входа
      store.addEffect({ id: `loop_${i}`, effectKind: 'positive', maxHpModifier: { value: 1, op: '+' } });
      store.expireEffect(`loop_${i}`);
    }
    expect(useCharacterStore.getState().derivedStats).toBeTruthy();
  });
});
