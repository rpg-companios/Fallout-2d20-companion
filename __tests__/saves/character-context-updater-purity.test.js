// Патч 218: стор-действия не должны исполняться внутри апдейтеров useState.
//
// Обёртки-сеттеры CharacterProvider (setEquippedRobotSlots / setEquippedRobotModules /
// setSelectedPerks) зеркалят значение в зустанд-стор. Раньше зеркало вызывалось прямо
// в функциональном апдейтере setState: React исполняет апдейтер ВО ВРЕМЯ рендера,
// стор обновлялся из рендера, и подписка CharacterProvider получала
// «Cannot update a component (CharacterProvider) while rendering a different
// component (CharacterProvider)» (React 19 dev). Зеркало обязано быть
// отложенным (queueMicrotask), а не выполняться в апдейтере.
//
// Импортировать CharacterContext в vitest нельзя (react-native — Flow), поэтому
// инвариант проверяется статически по AST, как в
// __tests__/survival/character-context-imports.test.js.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

const FILE = path.resolve(__dirname, '../../components/CharacterContext.js');

const parse = () => parseSync(fs.readFileSync(FILE, 'utf8'), {
  filename: FILE,
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  plugins: [jsxPlugin],
});

const WRAPPED_SETTERS = ['setEquippedRobotSlots', 'setEquippedRobotModules', 'setSelectedPerks'];

const isCallTo = (node, calleeName) =>
  node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === calleeName;

// Вызов useCharacterStore.getState().<anything>(...) — запись/чтение через стор.
const isStoreGetStateCall = (node) => {
  if (node?.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee?.type !== 'MemberExpression') return false;
  const object = callee.object;
  return (
    object?.type === 'CallExpression'
    && object.callee?.type === 'MemberExpression'
    && object.callee.object?.type === 'Identifier'
    && object.callee.object.name === 'useCharacterStore'
    && object.callee.property?.name === 'getState'
  );
};

// Ищем апдейтер-стрелку, переданный в setXxxRaw, внутри тела обёртки.
const findUpdaterArrows = (ast, setterName) => {
  const rawName = `${setterName}Raw`;
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === rawName) {
      for (const arg of node.arguments) {
        if (arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression') found.push(arg);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && child.type) walk(child);
    }
  };
  walk(ast);
  return found;
};

// Стор-вызовы внутри апдейтера, не обёрнутые в queueMicrotask.
const collectStoreWritesOutsideMicrotask = (updater) => {
  const violations = [];
  const walk = (node, inMicrotask) => {
    if (!node || typeof node !== 'object') return;
    if (isStoreGetStateCall(node) && !inMicrotask) {
      violations.push(node.loc.start.line);
    }
    const nextIn = inMicrotask || isCallTo(node, 'queueMicrotask');
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => walk(c, nextIn));
      else if (child && typeof child === 'object' && child.type) walk(child, nextIn);
    }
  };
  walk(updater, false);
  return violations;
};

describe('CharacterContext: апдейтеры useState не пишут в стор из рендера (патч 218)', () => {
  const ast = parse();

  it.each(WRAPPED_SETTERS)('%s существует и передаёт функциональный апдейтер', (setterName) => {
    const updaters = findUpdaterArrows(ast, setterName);
    expect(updaters.length).toBeGreaterThan(0);
  });

  it.each(WRAPPED_SETTERS)('%s: стор-действия только внутри queueMicrotask', (setterName) => {
    const updaters = findUpdaterArrows(ast, setterName);
    for (const updater of updaters) {
      const violations = collectStoreWritesOutsideMicrotask(updater);
      expect(
        violations,
        `useCharacterStore.getState() вызывается в апдейтере ${setterName} вне queueMicrotask (строки: ${violations.join(', ')})`,
      ).toEqual([]);
    }
  });

  it('зеркало в стор по-прежнему присутствует (отложенно)', () => {
    const src = fs.readFileSync(FILE, 'utf8');
    expect(src).toContain('loadRobotState');
    expect(src).toContain('setSelectedPerks(next || [])');
    for (const setterName of WRAPPED_SETTERS) {
      const updaters = findUpdaterArrows(ast, setterName);
      let microtasks = 0;
      for (const updater of updaters) {
        const walk = (node) => {
          if (!node || typeof node !== 'object') return;
          if (isCallTo(node, 'queueMicrotask')) microtasks += 1;
          for (const key of Object.keys(node)) {
            if (key === 'loc' || key === 'start' || key === 'end') continue;
            const child = node[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === 'object' && child.type) walk(child);
          }
        };
        walk(updater);
      }
      expect(microtasks, `${setterName}: ожидается отложенное зеркало в стор`).toBeGreaterThan(0);
    }
  });
});
