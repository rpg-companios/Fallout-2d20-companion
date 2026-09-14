// Шаг 8а миграции: здоровье/радиация — стор-каунтеры. Фасад useCharacter()
// поля и действия больше не отдаёт; экраны (CharacterScreen, WeaponsAndArmorScreen)
// и SurvivalClock зовут стор напрямую. Поведение каунтеров — в
// counters-store-slice.test.js; формат сейва не менялся (buildSnapshot
// сохраняет currentHealth/radiation под прежними ключами).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

const CONTEXT_FILE = path.resolve(__dirname, '../../components/CharacterContext.js');
const SAVES_FILE = path.resolve(__dirname, '../../src/saves/characterSaves.js');
const SCREENS = {
  CharacterScreen: path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/CharacterScreen.js'),
  WeaponsAndArmorScreen: path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js'),
  SurvivalClock: path.resolve(__dirname, '../../modules/fallout/survival/SurvivalClock.js'),
};

// TS-плагин — только .tsx (на .js он трактует <…> как типовые дженерики).
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

const STEP8A_MEMBERS = [
  'currentHealth', 'setCurrentHealth', 'healCharacter', 'damageCharacter',
  'radiation', 'setRadiation', 'addRadiation', 'healRadiation',
  'applySurvivalHpLoss',
];

describe('Шаг 8а: фасад useCharacter() без счётчиков', () => {
  const ast = parse(CONTEXT_FILE);
  const facadeValues = [];
  // Патч 242: фасад пуст (value = {}) — ищем объект по имени переменной.
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator'
      && node.id?.type === 'Identifier'
      && node.id.name === 'value'
      && node.init?.type === 'ObjectExpression') {
      facadeValues.push(node.init);
    }
  });

  it('фасадный value найден ровно один', () => {
    expect(facadeValues.length).toBe(1);
  });

  it('в value нет полей/действий счётчиков', () => {
    const names = facadeValues[0].properties.map(propertyName);
    expect(names.filter((name) => STEP8A_MEMBERS.includes(name))).toEqual([]);
  });

  it('снапшот сейва сохраняет currentHealth/radiation (формат не менялся)', () => {
    const snapshots = [];
    walk(parse(SAVES_FILE), (node) => {  // патч 242: buildSnapshot в модуле сейвов
      if (node.type === 'ObjectExpression'
        && node.properties.some((prop) => propertyName(prop) === 'currentHealth')
        && node.properties.some((prop) => propertyName(prop) === 'chemDosesLog')
        && node.properties.some((prop) => propertyName(prop) === 'equipment')) {
        snapshots.push(node);
      }
    });
    expect(snapshots.length).toBe(1);
  });

  it('счётчики — стор; снапшот читает state.currentHealth/state.radiation', () => {
    // Патч 242: контекст пуст; экраны (CharacterScreen) читают стор напрямую.
    const cs = fs.readFileSync(SCREENS.WeaponsAndArmorScreen, 'utf8');
    expect(cs).toContain('useCharacterStore((state) => state.currentHealth)');
    const saves = fs.readFileSync(SAVES_FILE, 'utf8');
    expect(saves).toContain('currentHealth: state.currentHealth');
    expect(saves).toContain('radiation: state.radiation');
    expect(saves).not.toContain('setRadiationRaw');
  });
});

describe('Шаг 8а: потребители — напрямую на стор', () => {
  it('экраны не берут счётчики из фасада', () => {
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
            if (STEP8A_MEMBERS.includes(propName)) violations.push(`${name}: ${propName}`);
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it('SurvivalClock больше не импортирует контекст (цикл разорван)', () => {
    const source = fs.readFileSync(SCREENS.SurvivalClock, 'utf8');
    expect(source).not.toContain('CharacterContext');
    expect(source).toContain('useCharacterStore.getState().applySurvivalHpLoss');
  });

  it('store-слайс экспортирует действия счётчиков', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/store/characterStore.js'), 'utf8');
    for (const action of ['setCurrentHealth:', 'healCharacter:', 'damageCharacter:', 'addRadiation:', 'healRadiation:', 'setRadiation:', 'applySurvivalHpLoss:']) {
      expect(source).toContain(action);
    }
  });
});
