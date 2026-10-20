// Инвариант «апдейтеры не пишут в стор из рендера» (патч 218) — ПОСЛЕ Шага 8в.
//
// История. Обёртки-сеттеры CharacterProvider (setEquippedRobotSlots /
// setEquippedRobotModules / setSelectedPerks) держали useState + зеркало в
// зустанд-стор через queueMicrotask: стор-действие внутри функционального
// апдейтера исполнялось React'ом во время рендера и падало с
// «Cannot update a component (CharacterProvider) while rendering a
// different component (CharacterProvider)».
//
// The context wrappers are gone: shared setters remain in the engine store,
// while robot extension actions use the generic setting-action bridge. The
// store executes functional updaters, so React render is not part of writes.
// остались селекторы экранов и динамические проверки апдейтеров
// (обязательное требование к сеттерам, прецедент setEquippedWeapons).

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import useCharacterStore from '../../src/store/characterStore';
import { selectFalloutRobotState } from '../../modules/fallout/store/robotSelectors.js';

// Патч 243: контекст снесён; сеттеры берут напрямую экраны-потребители.
const SCREEN_FILE = path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/CharacterScreen.js');
const PERKS_FILE = path.resolve(__dirname, '../../modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js');
const SETTERS = ['setEquippedRobotSlots', 'setEquippedRobotModules', 'setSelectedPerks'];

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('Шаг 8а: Raw-обёртки патча 218 сняты, стор-действия принимают апдейтер', () => {
  it('экраны получают сеттеры из стора (селекторы, не локальные функции)', () => {
    // Патч 242: контекст пуст; селекторы живут в экранах-потребителях.
    const sources = {
      setEquippedRobotSlots: fs.readFileSync(SCREEN_FILE, 'utf8'),
      setEquippedRobotModules: fs.readFileSync(SCREEN_FILE, 'utf8'),
      setSelectedPerks: fs.readFileSync(PERKS_FILE, 'utf8'),
    };
    for (const setterName of SETTERS) {
      const expected = setterName === 'setSelectedPerks'
        ? `useCharacterStore((s) => s.${setterName})`
        : `useSettingAction('robotEquipment', '${setterName}')`;
      expect(sources[setterName]).toContain(expected);
    }
  });

  it.each(SETTERS)('%s: функциональный апдейтер исполняет стор', (setterName) => {
    const store = useCharacterStore.getState();
    const initial = setterName === 'setSelectedPerks' ? [] : setterName === 'setEquippedRobotModules' ? [] : {};
    const action = setterName === 'setSelectedPerks'
      ? store[setterName]
      : store.getSettingAction('robotEquipment', setterName);
    expect(action).toBeTypeOf('function');
    // (prev) => next — апдейтер видит предыдущее значение стора.
    action((prev) => {
      expect(prev).toEqual(initial);
      if (setterName === 'setSelectedPerks') return [{ perkId: 'x', index: 0 }];
      if (setterName === 'setEquippedRobotSlots') return { legs: { limb: {} } };
      return [{ id: 'm1' }];
    });
    const state = useCharacterStore.getState();
    if (setterName === 'setSelectedPerks') {
      expect(state.selectedPerks).toEqual([{ perkId: 'x', index: 0 }]);
    } else if (setterName === 'setEquippedRobotSlots') {
      expect(selectFalloutRobotState(state).slots).toEqual({ legs: { limb: {} } });
    } else {
      expect(selectFalloutRobotState(state).modules).toEqual([{ id: 'm1' }]);
    }
  });
});
