// Robot equipment lives in the Fallout state extension; its actions are
// reached through the engine's generic setting-action bridge. Functional
// updaters preserve the prior slot/module payload and extension metadata.
// selectCarryWeight — плоский номер из derivedStats (форма {base,modifiers,total}),
// фолбэк — формула calculateCarryWeight.

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { selectCarryWeight } from '../../src/store/selectors';
import { selectFalloutRobotState } from '../../modules/fallout/store/robotSelectors.js';

const robotState = () => selectFalloutRobotState(useCharacterStore.getState());

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слоты/модули робота (Шаг 8а)', () => {
  it('setEquippedRobotSlots: значение + сохранение bodyPlan/mk2Installed', () => {
    const store = useCharacterStore.getState();
    store.getSettingAction('robotEquipment', 'initRobot')('protectron');
    store.setStateExtension('robot', { ...robotState(), mk2Installed: true });
    store.getSettingAction('robotEquipment', 'setEquippedRobotSlots')({ head: { limb: { id: 'l1' } } });
    const robot = robotState();
    expect(robot.bodyPlan).toBe('protectron');
    expect(robot.mk2Installed).toBe(true);
    expect(robot.slots).toEqual({ head: { limb: { id: 'l1' } } });
  });

  it('setEquippedRobotSlots: функциональный апдейтер видит предыдущие слоты', () => {
    const store = useCharacterStore.getState();
    store.getSettingAction('robotEquipment', 'setEquippedRobotSlots')({ head: { limb: { id: 'l1' } } });
    store.getSettingAction('robotEquipment', 'setEquippedRobotSlots')((prev) => ({ ...prev, torso: { limb: { id: 'l2' } } }));
    expect(robotState().slots).toEqual({
      head: { limb: { id: 'l1' } },
      torso: { limb: { id: 'l2' } },
    });
  });

  it('setEquippedRobotSlots(null) → пустой словарь (семантика сброса контекста)', () => {
    useCharacterStore.getState().getSettingAction('robotEquipment', 'setEquippedRobotSlots')(null);
    expect(robotState().slots).toEqual({});
  });

  it('setEquippedRobotModules: значение/апдейтер, слоты не трогает', () => {
    const store = useCharacterStore.getState();
    store.getSettingAction('robotEquipment', 'setEquippedRobotSlots')({ head: { limb: { id: 'l1' } } });
    store.getSettingAction('robotEquipment', 'setEquippedRobotModules')([{ id: 'm1' }]);
    store.getSettingAction('robotEquipment', 'setEquippedRobotModules')((prev) => [...prev, { id: 'm2' }]);
    const robot = robotState();
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
