// Шаг 7 миграции: профиль персонажа (origin/trait/level/characterName,
// attributesSaved/skillsSaved, luckPoints/maxLuckPoints,
// availablePerkAttributePoints/addPerkAttributePoints) — в characterStore.
// Фасад useCharacter() поля и их сеттеры больше не отдаёт; экраны читают/
// пишут стор напрямую (CharacterScreen, PerksAndTraitsScreen, InventoryScreen,
// WeaponsAndArmorScreen, SurvivalConsumeModal).
//
// buildSnapshot сохраняет все поля профиля — формат сейва не менялся
// (поэтому value-маркер поиска в старых тестах переведён на resetCharacter,
// а здесь фасадный объект ищется строго по resetCharacter).
//
// Зеркало _characterContext подрезано до equipmentState (решение владельца):
// recalculateDerivedStats читает trait/level сам, powerArmorSlice.characterRules —
// origin/trait напрямую. Снапшот-поле формата сейва не тестируем здесь —
// оно покрыто save-тестами.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';
import tsPlugin from '@babel/plugin-transform-typescript';

const CONTEXT_FILE = path.resolve(__dirname, '../../components/CharacterContext.js');
const SCREENS = {
  CharacterScreen: path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/CharacterScreen.js'),
  PerksAndTraitsScreen: path.resolve(__dirname, '../../modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js'),
  InventoryScreen: path.resolve(__dirname, '../../components/screens/InventoryScreen/InventoryScreen.js'),
  WeaponsAndArmorScreen: path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js'),
  SurvivalConsumeModal: path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/modals/SurvivalConsumeModal.tsx'),
};

// TS-плагин — только .tsx (на .js он трактует <…> как типовые дженерики).
const parse = (file) => parseSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  plugins: [jsxPlugin, ...(file.endsWith('.tsx') ? [[tsPlugin, { isTSX: true }]] : [])],
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

const STEP7_FIELDS = [
  'origin', 'trait', 'level', 'characterName',
  'attributesSaved', 'skillsSaved',
  'luckPoints', 'maxLuckPoints',
  'availablePerkAttributePoints',
];
const STEP7_SETTERS = [
  'setOrigin', 'setTrait', 'setLevel', 'setCharacterName',
  'setAttributesSaved', 'setSkillsSaved',
  'setLuckPoints', 'setMaxLuckPoints',
  'setAvailablePerkAttributePoints', 'addPerkAttributePoints',
];

describe('Шаг 7: фасад useCharacter() без полей профиля', () => {
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

  it('в value нет полей и сеттеров Шага 7', () => {
    const names = facadeValues[0].properties.map(propertyName);
    expect(names.filter((name) => STEP7_FIELDS.includes(name))).toEqual([]);
    expect(names.filter((name) => STEP7_SETTERS.includes(name))).toEqual([]);
  });

  it('уровень/имя/origin/trait/флаги/удача/перки в контексте — стор-селекторы', () => {
    const source = fs.readFileSync(CONTEXT_FILE, 'utf8');
    for (const field of STEP7_FIELDS) {
      expect(source).toContain(`useCharacterStore((s) => s.${field})`);
    }
  });

  it('зеркало _characterContext подрезано: setCharacterContext не получает trait/level/origin', () => {
    const source = fs.readFileSync(CONTEXT_FILE, 'utf8');
    expect(source).toContain('current.setCharacterContext({\n        equipmentState:');
    expect(source).not.toMatch(/setCharacterContext\(\{\s*\n\s*trait,/);
  });

  it('buildSnapshot сохраняет поля профиля (формат сейва не менялся)', () => {
    const snapshots = [];
    walk(ast, (node) => {
      if (node.type === 'ObjectExpression'
        && node.properties.some((prop) => propertyName(prop) === 'attributesSaved')
        && node.properties.some((prop) => propertyName(prop) === 'luckPoints')
        && node.properties.some((prop) => propertyName(prop) === 'chemDosesLog')) {
        snapshots.push(node);
      }
    });
    expect(snapshots.length).toBe(1);
    const names = snapshots[0].properties.map(propertyName);
    for (const name of [...STEP7_FIELDS.slice(0, 9), 'availablePerkAttributePoints']) {
      if (name === 'maxLuckPoints') continue; // потолок в сейв не пишется (правило 1)
      expect(names).toContain(name);
    }
  });
});

describe('Шаг 7: экраны — напрямую на стор', () => {
  it('ни один экран не деструктурирует поля/сеттеры Шага 7 из useCharacter()', () => {
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
            if ([...STEP7_FIELDS, ...STEP7_SETTERS].includes(propName)) {
              violations.push(`${name}: ${propName}`);
            }
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it('экраны читают профиль из стора', () => {
    const cs = fs.readFileSync(SCREENS.CharacterScreen, 'utf8');
    expect(cs).toContain('useCharacterStore((s) => s.characterName)');
    expect(cs).toContain('useCharacterStore((s) => s.luckPoints)');
    const perks = fs.readFileSync(SCREENS.PerksAndTraitsScreen, 'utf8');
    expect(perks).toContain('useCharacterStore((s) => s.addPerkAttributePoints)');
    expect(perks).toContain('useCharacterStore((s) => s.attributesSaved)');
    const inv = fs.readFileSync(SCREENS.InventoryScreen, 'utf8');
    expect(inv).toContain('useCharacterStore((s) => s.origin)');
    expect(inv).toContain('useCharacterStore((s) => s.trait)');
    const wa = fs.readFileSync(SCREENS.WeaponsAndArmorScreen, 'utf8');
    expect(wa).toContain('useCharacterStore((s) => s.level)');
  });

  it('powerArmorSlice.characterRules читает публичные поля стора', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/store/powerArmorSlice.js'),
      'utf8',
    );
    expect(source).toContain('origin: get().origin || null');
    expect(source).toContain('trait: get().trait || null');
    expect(source).not.toContain('_characterContext || {}');
  });
});
