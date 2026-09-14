// Инвариант «апдейтеры не пишут в стор из рендера» (патч 218) — ПОСЛЕ Шага 8а.
//
// История. Обёртки-сеттеры CharacterProvider (setEquippedRobotSlots /
// setEquippedRobotModules / setSelectedPerks) держали useState + зеркало в
// зустанд-стор через queueMicrotask: стор-действие внутри функционального
// апдейтера исполнялось React'ом во время рендера и падало с
// «Cannot update a component (CharacterProvider) while rendering a
// different component (CharacterProvider)».
//
// Шаг 8а снял обёртки: сеттеры — прямые действия стора (robotSlice /
// characterStore), функциональный апдейтер исполняет сам стор, React-рендер
// в запись не вовлечён. Контракт проверяется:
//   1) статически: в CharacterContext не осталось Raw-обёрток и
//      queueMicrotask-зеркал для этих сеттеров;
//   2) динамически: стор-действия принимают функциональный апдейтер
//      (обязательное требование к сеттерам, прецедент setEquippedWeapons).

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';
import useCharacterStore from '../../src/store/characterStore';

const FILE = path.resolve(__dirname, '../../components/CharacterContext.js');
// Патч 242: контекст пуст; сеттеры берёт напрямую CharacterScreen.
const SCREEN_FILE = path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/CharacterScreen.js');
const PERKS_FILE = path.resolve(__dirname, '../../modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js');
const SETTERS = ['setEquippedRobotSlots', 'setEquippedRobotModules', 'setSelectedPerks'];

const parse = () => parseSync(fs.readFileSync(FILE, 'utf8'), {
  filename: FILE,
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  plugins: [jsxPlugin],
});

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('Шаг 8а: Raw-обёртки патча 218 сняты, стор-действия принимают апдейтер', () => {
  it('в CharacterContext нет Raw-обёрток мигрированных сеттеров', () => {
    const source = fs.readFileSync(FILE, 'utf8');
    for (const setterName of SETTERS) {
      expect(source).not.toContain(`${setterName}Raw`);
    }
    // Обёртки содержали отложенные зеркала — их тоже быть не должно.
    expect(source).not.toContain("setSelectedPerks(next || [])");
  });

  it('экраны получают сеттеры из стора (селекторы, не локальные функции)', () => {
    // Патч 242: контекст пуст; селекторы живут в экранах-потребителях.
    const sources = {
      setEquippedRobotSlots: fs.readFileSync(SCREEN_FILE, 'utf8'),
      setEquippedRobotModules: fs.readFileSync(SCREEN_FILE, 'utf8'),
      setSelectedPerks: fs.readFileSync(PERKS_FILE, 'utf8'),
    };
    for (const setterName of SETTERS) {
      expect(sources[setterName]).toContain(`useCharacterStore((s) => s.${setterName})`);
    }
  });

  it.each(SETTERS)('%s: функциональный апдейтер исполняет стор', (setterName) => {
    const store = useCharacterStore.getState();
    const initial = setterName === 'setSelectedPerks' ? [] : setterName === 'setEquippedRobotModules' ? [] : {};
    expect(store[setterName]).toBeTypeOf('function');
    // (prev) => next — апдейтер видит предыдущее значение стора.
    store[setterName]((prev) => {
      expect(prev).toEqual(initial);
      if (setterName === 'setSelectedPerks') return [{ perkId: 'x', index: 0 }];
      if (setterName === 'setEquippedRobotSlots') return { legs: { limb: {} } };
      return [{ id: 'm1' }];
    });
    const state = useCharacterStore.getState();
    if (setterName === 'setSelectedPerks') {
      expect(state.selectedPerks).toEqual([{ perkId: 'x', index: 0 }]);
    } else if (setterName === 'setEquippedRobotSlots') {
      expect(state.robot.slots).toEqual({ legs: { limb: {} } });
    } else {
      expect(state.robot.modules).toEqual([{ id: 'm1' }]);
    }
  });
});
