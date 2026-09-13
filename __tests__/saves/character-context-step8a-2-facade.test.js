// Шаг 8а (часть 2): слоты/модули робота, выбранные перки, зеркала производных —
// стор. Фасад useCharacter() больше не отдаёт: equippedRobotSlots/Modules и их
// сеттеры, selectedPerks/setSelectedPerks, carryWeight/meleeBonus/initiative/
// defense, hasTrait-замыкание, перковые лямбды. PerksAndTraitsScreen первым
// полностью перестаёт импортировать контекст. Поведение слайсов — в
// robot-perks-store-slice.test.js; формат сейва не менялся (пустой словарь
// слотов пишется в снапшот как null — как раньше).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

const CONTEXT_FILE = path.resolve(__dirname, '../../components/CharacterContext.js');
const SCREENS = {
  CharacterScreen: path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/CharacterScreen.js'),
  WeaponsAndArmorScreen: path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js'),
  InventoryScreen: path.resolve(__dirname, '../../components/screens/InventoryScreen/InventoryScreen.js'),
  ArmorLayerModal: path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/modals/ArmorLayerModal.js'),
  LimbUpgradeModal: path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/modals/LimbUpgradeModal.js'),
};
const PERKS_SCREEN = path.resolve(__dirname, '../../modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js');

const parse = (file) => parseSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  plugins: [jsxPlugin, ...(file.endsWith('.tsx') ? [['@babel/plugin-transform-typescript', { isTSX: true }]] : [])],
});

const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (typeof node.type === 'string') visit(node);
  Object.values(node).forEach((value) => walk(value, visit));
};

const propertyName = (prop) => {
  if (!prop) return null;
  if (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') {
    const key = prop.key;
    if (key.type === 'Identifier') return key.name;
    if (key.type === 'StringLiteral') return key.value;
  }
  return null;
};

const REMOVED_MEMBERS = [
  'equippedRobotSlots', 'setEquippedRobotSlots',
  'equippedRobotModules', 'setEquippedRobotModules',
  'selectedPerks', 'setSelectedPerks',
  'carryWeight', 'meleeBonus', 'initiative', 'defense',
  'hasTrait', 'annotatePerks', 'meetsPerkRequirements', 'getPerkUnmetReasons',
];

describe('Шаг 8а (часть 2): фасад без робота/перков/зеркал', () => {
  const ast = parse(CONTEXT_FILE);
  const facadeValues = [];
  walk(ast, (node) => {
    if (node.type === 'ObjectExpression'
      && node.properties.some((prop) => propertyName(prop) === 'resetCharacter')
      && node.properties.some((prop) => propertyName(prop) === 'characterId')) {
      facadeValues.push(node);
    }
  });

  it('фасадный value найден ровно один', () => {
    expect(facadeValues.length).toBe(1);
  });

  it('в value нет членов Шага 8а (часть 2)', () => {
    const names = facadeValues[0].properties.map(propertyName);
    expect(names.filter((name) => REMOVED_MEMBERS.includes(name))).toEqual([]);
  });

  it('снапшот сейва сохраняет ключи робота (формат не менялся)', () => {
    const snapshots = [];
    walk(ast, (node) => {
      if (node.type === 'ObjectExpression'
        && node.properties.some((prop) => propertyName(prop) === 'equippedRobotSlots')
        && node.properties.some((prop) => propertyName(prop) === 'equippedRobotModules')
        && node.properties.some((prop) => propertyName(prop) === 'chemDosesLog')) {
        snapshots.push(node);
      }
    });
    expect(snapshots.length).toBe(1);
  });

  it('в контексте не осталось зеркал-калькуляторов (useState производных)', () => {
    const source = fs.readFileSync(CONTEXT_FILE, 'utf8');
    // (вхождения в комментариях-истории не считаются: ищем только код)
    for (const dead of ['setCarryWeight(', 'setMeleeBonus(', 'setInitiative(', 'setDefense(', 'const applyDerived']) {
      expect(source).not.toContain(dead);
    }
  });
});

describe('Шаг 8а (часть 2): экраны — напрямую на стор', () => {
  it('экраны не деструктурируют снятые члены из useCharacter()', () => {
    const violations = [];
    for (const [name, file] of Object.entries(SCREENS)) {
      walk(parse(file), (node) => {
        if (node.type === 'VariableDeclarator'
          && node.id?.type === 'ObjectPattern'
          && node.init?.type === 'CallExpression'
          && node.init.callee?.type === 'Identifier'
          && node.init.callee.name === 'useCharacter') {
          for (const prop of node.id.properties) {
            const propName = propertyName(prop) ?? prop.argument?.name ?? null;
            if (REMOVED_MEMBERS.includes(propName)) violations.push(`${name}: ${propName}`);
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it('PerksAndTraitsScreen первым полностью отвязался от контекста', () => {
    const source = fs.readFileSync(PERKS_SCREEN, 'utf8');
    expect(source).not.toContain('CharacterContext');
    expect(source).toContain("useCharacterStore((s) => s.selectedPerks)");
    expect(source).toContain("annotatePerks(perksData, attributes, level, selectedPerks,");
  });

  it('InventoryScreen берёт вес через selectCarryWeight', () => {
    const source = fs.readFileSync(SCREENS.InventoryScreen, 'utf8');
    expect(source).toContain('useCharacterStore(selectCarryWeight)');
  });

  it('robotSlice экспортирует прямые действия слотов/модулей', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/store/robotSlice.js'),
      'utf8',
    );
    expect(source).toContain('setEquippedRobotSlots: (updater)');
    expect(source).toContain('setEquippedRobotModules: (updater)');
  });
});
