// Шаг 6 миграции: фасад useCharacter() больше не отдаёт поля условий/
// заболеваний (conditions, chemDosesLog, lastDiseaseResistAt, sceneRiskStates,
// activeTimedEffects) и их сеттеры. Экраны читают стор напрямую
// (WeaponsAndArmorScreen → lastDiseaseResistAt).
//
// Тень activeTimedEffects удалена (решение владельца, вариант А): канон —
// словарь effects стора; секундный тик тени удалён; массив для сейва —
// денормализация словаря (denormalizeEffects(storeEffects)).
//
// CharacterContext в vitest не импортируется (react-native Flow) — контракт
// проверяется статически по AST, как в character-context-step5-facade.test.js.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

const CONTEXT_FILE = path.resolve(__dirname, '../../components/CharacterContext.js');
const WA_FILE = path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js');

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

describe('Шаг 6: фасад useCharacter() без полей условий/заболеваний', () => {
  const ast = parse(CONTEXT_FILE);
  const source = fs.readFileSync(CONTEXT_FILE, 'utf8');

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

  it('в value нет полей и сеттеров Шага 6 (buildSnapshot не считаем: формат сейва)', () => {
    // Сеттеры запрещены в ЛЮБОМ объекте с маркером.
    const forbiddenSetters = [
      'setActiveTimedEffects', 'setConditions', 'setChemDosesLog',
      'setLastDiseaseResistAt', 'setSceneRiskStates',
    ];
    // Читаемые поля Шага 6 запрещены только во фасадном value. Объект
    // buildSnapshot тоже содержит attributesSaved (формат сейва) и обязан
    // сохранять эти поля как поля сейва — его не проверяем.
    const forbiddenReads = [
      'activeTimedEffects', 'conditions', 'chemDosesLog',
      'lastDiseaseResistAt', 'sceneRiskStates',
    ];
    const facadeValues = valueObjects.filter((object) =>
      object.properties.map(propertyName).includes('resetCharacter'));
    expect(facadeValues.length).toBeGreaterThanOrEqual(1);
    for (const object of valueObjects) {
      const names = object.properties.map(propertyName);
      expect(names.filter((name) => forbiddenSetters.includes(name))).toEqual([]);
    }
    for (const object of facadeValues) {
      const names = object.properties.map(propertyName);
      expect(names.filter((name) => forbiddenReads.includes(name))).toEqual([]);
    }
  });

  it('в контексте нет ни одного вызова setActiveTimedEffects (тень удалена)', () => {
    const calls = [];
    walk(ast, (node) => {
      if (node.type === 'Identifier' && node.name === 'setActiveTimedEffects') calls.push(node);
    });
    expect(calls).toEqual([]);
  });

  it('поля Шага 6 больше не useState провайдера', () => {
    const names = [];
    walk(ast, (node) => {
      if (node.type === 'VariableDeclarator'
        && node.id?.type === 'ArrayPattern'
        && node.init?.type === 'CallExpression'
        && node.init.callee?.type === 'Identifier'
        && node.init.callee.name === 'useState') {
        node.id.elements.forEach((element) => {
          if (element?.type === 'Identifier') names.push(element.name);
        });
      }
    });
    for (const name of ['conditions', 'chemDosesLog', 'lastDiseaseResistAt', 'sceneRiskStates', 'activeTimedEffects']) {
      expect(names).not.toContain(name);
    }
  });

  it('снапшот берёт activeTimedEffects из словаря стора (денормализация)', () => {
    expect(source).toContain('activeTimedEffects: denormalizeEffects(storeEffects)');
  });

  it('секундный тик тени удалён (остался только тик Ядерного блока)', () => {
    expect(source.split('setInterval').length - 1).toBe(1);
  });

  it('колбэки болезней остались на фасаде (их потребители — DI survival и W&A)', () => {
    for (const name of ['advanceEffectsByGameHours', 'resolveSceneRiskEventById', 'reducePersistentDiseaseRanks', 'resistDisease']) {
      expect(source).toContain(name);
    }
  });
});

describe('Шаг 6: WeaponsAndArmorScreen читает стор напрямую', () => {
  const source = fs.readFileSync(WA_FILE, 'utf8');

  it('lastDiseaseResistAt — из useCharacterStore, не из useCharacter()', () => {
    expect(source).toContain('const { resistDisease } = useCharacter();');
    expect(source).toContain('useCharacterStore((state) => state.lastDiseaseResistAt)');
  });
});
