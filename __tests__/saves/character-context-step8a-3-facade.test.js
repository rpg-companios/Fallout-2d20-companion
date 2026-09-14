// Шаг 8а (часть 3): комплект (сквозной прогон к стору с Шага 1), сцены,
// «эффекты трейтов», изменённые предметы. Фасад useCharacter() больше не
// отдаёт: equipment/setEquipment, effects/setEffects, sceneCounter,
// modifiedItems/setModifiedItems, getModifiedItem/saveModifiedItem/
// removeModifiedItem/getItemId. LimbUpgradeModal — второй экран, полностью
// отвязавшийся от контекста (после PerksAndTraitsScreen).
//
// Формат сейва не менялся: в снапшоте исторические ключи effects
// (источник — стор-поле traitEffects) и modifiedItems (Map → массив пар).
// Поведение слайсов — в scene-effects-modified-store-slice.test.js.

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
  InventoryScreen: path.resolve(__dirname, '../../components/screens/InventoryScreen/InventoryScreen.js'),
};
const LIMB_MODAL = path.resolve(__dirname, '../../modules/fallout/screens/CharacterScreen/modals/LimbUpgradeModal.js');

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
  'equipment', 'setEquipment',
  'effects', 'setEffects', 'sceneCounter',
  'modifiedItems', 'setModifiedItems',
  'getModifiedItem', 'saveModifiedItem', 'removeModifiedItem', 'getItemId',
  'commitAttributeChanges', // патч 238
  // патч 240: оркестраторы — orchestratorsSlice
  'applyConsumableFull', 'reducePersistentDiseaseRanks', 'resistDisease',
  'advanceEffectsByGameHours', 'resolveSceneRiskEventById',
  'stateExtensions', 'setStateExtension',
];

describe('Шаг 8а (часть 3): фасад без комплекта/сцен/эффектов/модификаций', () => {
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

  it('в value нет членов Шага 8а (часть 3)', () => {
    const names = facadeValues[0].properties.map(propertyName);
    expect(names.filter((name) => REMOVED_MEMBERS.includes(name))).toEqual([]);
  });

  it('снапшот сейва сохраняет исторические ключи effects/modifiedItems/sceneCounter', () => {
    const snapshots = [];
    walk(parse(SAVES_FILE), (node) => {  // патч 242: buildSnapshot в модуле сейвов
      if (node.type === 'ObjectExpression'
        && node.properties.some((prop) => propertyName(prop) === 'chemDosesLog')
        && node.properties.some((prop) => propertyName(prop) === 'effects')
        && node.properties.some((prop) => propertyName(prop) === 'modifiedItems')
        && node.properties.some((prop) => propertyName(prop) === 'sceneCounter')) {
        snapshots.push(node);
      }
    });
    expect(snapshots.length).toBe(1);
  });

  it('effects — алиас traitEffects (стор), модификации — Map из словаря стора (модуль сейвов)', () => {
    // Патч 242: и то и другое теперь в buildSnapshot модуля сейвов.
    const source = fs.readFileSync(SAVES_FILE, 'utf8');
    expect(source).toContain('effects: state.traitEffects');
    expect(source).toContain('modifiedItems: new Map(Object.entries(state.modifiedItems || {}))');
  });
});

describe('Шаг 8а (часть 3): экраны — напрямую на стор', () => {
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

  it('LimbUpgradeModal — второй экран, полностью отвязавшийся от контекста', () => {
    const source = fs.readFileSync(LIMB_MODAL, 'utf8');
    expect(source).not.toContain('CharacterContext');
  });

  it('CharacterScreen пишет «эффекты трейтов» через стор (setTraitEffects)', () => {
    const source = fs.readFileSync(SCREENS.CharacterScreen, 'utf8');
    expect(source).toContain('useCharacterStore((s) => s.setTraitEffects)');
    expect(source).toContain('setTraitEffects((currentEffects)');
  });

  it('Inventory собирает read-хелпер модификаций из стор-словаря', () => {
    const source = fs.readFileSync(SCREENS.InventoryScreen, 'utf8');
    expect(source).toContain('useCharacterStore((s) => s.modifiedItems)');
    expect(source).toContain("storeModifiedItems[getItemId(item)] || item");
  });

  it('store/itemIdentity: слайс сцены/эффекты/модификации, getItemId в домене', () => {
    const store = fs.readFileSync(path.resolve(__dirname, '../../src/store/characterStore.js'), 'utf8');
    for (const action of ['setSceneCounter:', 'setTraitEffects:', 'setModifiedItems:', 'commitAttributeChanges:']) {
      expect(store).toContain(action);
    }
    const orchestrators = fs.readFileSync(path.resolve(__dirname, '../../src/store/orchestratorsSlice.js'), 'utf8');
    for (const action of ['const applyConsumableFull', 'const resistDisease', 'const reducePersistentDiseaseRanks', 'const advanceEffectsByGameHours']) {
      expect(orchestrators).toContain(action);
    }
    const identity = fs.readFileSync(path.resolve(__dirname, '../../domain/itemIdentity.js'), 'utf8');
    expect(identity).toContain('export const getItemId');
  });

  it('патч 237: экраны не пишут альбом модификаций (схема id+моды)', () => {
    const wa = fs.readFileSync(SCREENS.WeaponsAndArmorScreen, 'utf8');
    expect(wa).not.toContain('saveModifiedItem');
    // Предмет несёт id модов на себе (appliedArmorModId/…) — сборщик домена
    // (applyArmorMods/resolveEffectiveItem) пересобирает статы при загрузке.
    const modal = fs.readFileSync(
      path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/modal/ArmorModificationModal.js'),
      'utf8',
    );
    expect(modal).toContain('[stdKey]: selectedStd || null');
  });
});
