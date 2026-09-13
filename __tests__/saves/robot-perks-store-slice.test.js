// Шаг 8а (часть 2): слоты/модули робота и выбранные перки — стор.
// setEquippedRobotSlots/setEquippedRobotModules (robotSlice) заменяют
// useState-обёртки CharacterContext (патч 218): функциональный апдейтер
// обязателен, bodyPlan/mk2Installed сохраняются, производные пересчитываются.
// selectCarryWeight — плоский номер из derivedStats (форма {base,modifiers,total}),
// фолбэк — формула calculateCarryWeight.

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { selectCarryWeight } from '../../src/store/selectors';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слоты/модули робота (Шаг 8а)', () => {
  it('setEquippedRobotSlots: значение + сохранение bodyPlan/mk2Installed', () => {
    const store = useCharacterStore.getState();
    store.initRobot('protectron');
    useCharacterStore.setState({ robot: { ...useCharacterStore.getState().robot, mk2Installed: true } });
    store.setEquippedRobotSlots({ head: { limb: { id: 'l1' } } });
    const robot = useCharacterStore.getState().robot;
    expect(robot.bodyPlan).toBe('protectron');
    expect(robot.mk2Installed).toBe(true);
    expect(robot.slots).toEqual({ head: { limb: { id: 'l1' } } });
  });

  it('setEquippedRobotSlots: функциональный апдейтер видит предыдущие слоты', () => {
    const store = useCharacterStore.getState();
    store.setEquippedRobotSlots({ head: { limb: { id: 'l1' } } });
    store.setEquippedRobotSlots((prev) => ({ ...prev, torso: { limb: { id: 'l2' } } }));
    expect(useCharacterStore.getState().robot.slots).toEqual({
      head: { limb: { id: 'l1' } },
      torso: { limb: { id: 'l2' } },
    });
  });

  it('setEquippedRobotSlots(null) → пустой словарь (семантика сброса контекста)', () => {
    useCharacterStore.getState().setEquippedRobotSlots(null);
    expect(useCharacterStore.getState().robot.slots).toEqual({});
  });

  it('setEquippedRobotModules: значение/апдейтер, слоты не трогает', () => {
    const store = useCharacterStore.getState();
    store.setEquippedRobotSlots({ head: { limb: { id: 'l1' } } });
    store.setEquippedRobotModules([{ id: 'm1' }]);
    store.setEquippedRobotModules((prev) => [...prev, { id: 'm2' }]);
    const robot = useCharacterStore.getState().robot;
    expect(robot.modules).toEqual([{ id: 'm1' }, { id: 'm2' }]);
    expect(robot.slots).toEqual({ head: { limb: { id: 'l1' } } });
  });

  it('setSelectedPerks: значение/апдейтер', () => {
    const store = useCharacterStore.getState();
    store.setSelectedPerks([{ perkId: 'awareness', index: 0 }]);
    expect(useCharacterStore.getState().selectedPerks).toEqual([{ perkId: 'awareness', index: 0 }]);
    store.setSelectedPerks((prev) => prev.slice(0, -1));
    expect(useCharacterStore.getState().selectedPerks).toEqual([]);
  });
});

describe('selectCarryWeight (Шаг 8а)', () => {
  it('берёт плоский номер из derivedStats.carryWeight.total', () => {
    useCharacterStore.getState().setBaseAttributes([{ name: 'STR', value: 7 }]);
    const state = useCharacterStore.getState();
    const total = selectCarryWeight(state);
    expect(typeof total).toBe('number');
    // База 150 + 10×СИЛ = 220 (гуль/особость не выбраны — модификаторов нет).
    expect(total).toBe(220);
  });

  it('фолбэк на формулу, если derivedStats ещё пуст', () => {
    const state = { ...useCharacterStore.getState(), derivedStats: {} };
    expect(selectCarryWeight(state)).toBe(190); // 150 + 10×4 (стартовая СИЛ)
  });
});
