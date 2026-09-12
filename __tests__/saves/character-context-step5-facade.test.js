// Шаг 5 миграции attributes/skills: фасад useCharacter() больше не отдаёт
// сеттеры полей, ставших словарями стора (setAttributes/setSkills +
// selection-списки setSelectedSkills/setExtraTaggedSkills/setForcedSelectedSkills).
// Экраны читают производные массивы из контекста, пишут ТОЛЬКО в стор
// (setBaseAttributes/setBaseSkills + стор-экшены selection-списков).
// Дельта-зеркала (updateAttribute/updateSkill + подсев loadFromLegacyData)
// из CharacterScreen убраны: стор — единственный источник.
//
// CharacterContext в vitest не импортируется (react-native Flow), поэтому
// контракт проверяется статически по AST, как в
// character-context-updater-purity.test.js и survival/character-context-imports.test.js.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

const CONTEXT_FILE = path.resolve(__dirname, '../../components/CharacterContext.js');
const SCREEN_FILE = path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/CharacterScreen.js');

const parse = (file) => parseSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  plugins: [jsxPlugin],
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

// ─── Фасад контекста ───

describe('Шаг 5: фасад useCharacter() без сеттеров атрибутов/навыков', () => {
  const ast = parse(CONTEXT_FILE);

  const valueObjects = [];
  walk(ast, (node) => {
    if (node.type === 'ObjectExpression'
      && node.properties.some((prop) => propertyName(prop) === 'resetCharacter')) {
      valueObjects.push(node);
    }
  });

  it('объект value провайдера найден', () => {
    expect(valueObjects.length).toBeGreaterThanOrEqual(1);
  });

  it('в value нет setAttributes/setSkills и сеттеров selection-списков', () => {
    const forbidden = ['setAttributes', 'setSkills', 'setSelectedSkills', 'setExtraTaggedSkills', 'setForcedSelectedSkills'];
    for (const object of valueObjects) {
      const names = object.properties.map(propertyName);
      expect(names.filter((name) => forbidden.includes(name))).toEqual([]);
    }
  });

  it('в value остались только чтения: атрибуты/навыки/selection-списки', () => {
    const required = ['attributes', 'skills', 'selectedSkills', 'extraTaggedSkills', 'forcedSelectedSkills'];
    const names = valueObjects.flatMap((object) => object.properties.map(propertyName));
    for (const name of required) {
      expect(names).toContain(name);
    }
  });

  it('массивы контекста производятся селекторами стора (единая реализация)', () => {
    const source = fs.readFileSync(CONTEXT_FILE, 'utf8');
    expect(source).toContain("import { selectLegacyAttributes, selectLegacySkills } from '../src/store/selectors'");
  });
});

// ─── CharacterScreen: пишем только в стор ───

describe('Шаг 5: CharacterScreen пишет в стор напрямую', () => {
  const ast = parse(SCREEN_FILE);
  const source = fs.readFileSync(SCREEN_FILE, 'utf8');

  it('useCharacter() не деструктурирует сеттеры Шага 5', () => {
    const forbidden = ['setAttributes', 'setSkills', 'setSelectedSkills', 'setExtraTaggedSkills', 'setForcedSelectedSkills'];
    const violations = [];
    walk(ast, (node) => {
      if (node.type === 'VariableDeclarator'
        && node.id?.type === 'ObjectPattern'
        && node.init?.type === 'CallExpression'
        && node.init.callee?.type === 'Identifier'
        && node.init.callee.name === 'useCharacter') {
        for (const prop of node.id.properties) {
          const name = propertyName(prop) ?? prop.argument?.name ?? null;
          if (forbidden.includes(name)) violations.push(name);
        }
      }
    });
    expect(violations).toEqual([]);
  });

  it('дельта-зеркала из экрана убраны (updateAttribute/updateSkill/подсев loadFromLegacyData)', () => {
    const calls = [];
    walk(ast, (node) => {
      if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
        && node.callee.property?.type === 'Identifier') {
        calls.push(node.callee.property.name);
      }
    });
    expect(calls.filter((name) => ['updateAttribute', 'updateSkill', 'loadFromLegacyData'].includes(name))).toEqual([]);
  });

  it('записи идут через стор-экшены setBaseAttributes/setBaseSkills', () => {
    expect(source).toContain('const setBaseAttributes = useCharacterStore');
    expect(source).toContain('const setBaseSkills = useCharacterStore');
    expect(source).toContain('setBaseAttributes(nextAttributes)');
    expect(source).toContain('setBaseSkills(');
  });

  it('selection-списки читаются из стора, writer-ы — стор-экшены', () => {
    expect(source).toContain("useCharacterStore((s) => s.selectedSkills)");
    expect(source).toContain("useCharacterStore((s) => s.extraTaggedSkills)");
    expect(source).toContain("useCharacterStore((s) => s.forcedSelectedSkills)");
  });
});
