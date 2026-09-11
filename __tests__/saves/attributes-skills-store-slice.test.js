// Шаг 5 миграции attributes/skills из CharacterContext в characterStore:
// словари Parameter-формата — ЕДИНЫЙ источник; legacy-массивы — производные
// (селекторы selectLegacyAttributes/selectLegacySkills, общие для провайдера
// и экранов). Начальный стейт сеется дефолтами создания, «пустой словарь при
// открытом UI» — недопустимое состояние (снимает подсевающий эффект из
// CharacterProvider). Запись — абсолютная (setBaseAttributes/setBaseSkills),
// дельта-зеркала (updateAttribute/updateSkill + loadFromLegacyData-подсев)
// из экранов убраны. Selection-списки (selectedSkills/extraTaggedSkills/
// forcedSelectedSkills) тоже переехали: сеттеры поддерживают функциональный
// апдейтер (прецедент setEquippedWeapons).
//
// НЕ в этом тесте: фасад useCharacter() (проверяется статически по AST в
// character-context-step5-facade.test.js — CharacterContext в vitest не
// импортируется, react-native Flow).

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { selectLegacyAttributes, selectLegacySkills } from '../../src/store/selectors';
import { createInitialAttributes, ALL_SKILLS } from '../../domain/characterCreation';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс attributes/skills (Шаг 5)', () => {
  it('начальный стейт сеется дефолтами создания: 7 атрибутов по 4', () => {
    const { attributes } = useCharacterStore.getState();
    expect(Object.keys(attributes).sort()).toEqual(['AGI', 'CHA', 'END', 'INT', 'LCK', 'PER', 'STR']);
    expect(selectLegacyAttributes({ attributes })).toEqual(createInitialAttributes());
  });

  it('начальный стейт сеется полным каталогом навыков со значением 0', () => {
    const { skills } = useCharacterStore.getState();
    expect(Object.keys(skills).length).toBe(ALL_SKILLS.length);
    const legacy = selectLegacySkills({ skills });
    expect(legacy.map((s) => s.name)).toEqual(ALL_SKILLS.map((s) => s.name));
    expect(legacy.every((s) => s.value === 0)).toBe(true);
  });

  it('selectLegacyAttributes выводит {name, value} из словаря {id, base}', () => {
    useCharacterStore.getState().setBaseAttributes([
      { name: 'STR', value: 7 },
      { name: 'LCK', value: 5 },
    ]);
    const legacy = selectLegacyAttributes({ attributes: useCharacterStore.getState().attributes });
    expect(legacy).toEqual([
      { name: 'STR', value: 7 },
      { name: 'LCK', value: 5 },
    ]);
  });

  it('selectLegacySkills сохраняет порядок каталога и подставляет value из base', () => {
    useCharacterStore.getState().setBaseSkills([
      { name: ALL_SKILLS[0].name, value: 3 },
      { name: ALL_SKILLS[2].name, value: 2 },
    ]);
    const legacy = selectLegacySkills({ skills: useCharacterStore.getState().skills });
    expect(legacy.map((s) => s.name)).toEqual(ALL_SKILLS.map((s) => s.name));
    expect(legacy[0].value).toBe(3);
    expect(legacy[2].value).toBe(2);
    expect(legacy[1].value).toBe(0);
  });

  it('setBaseAttributes — абсолютная запись: ключи вне нового массива исчезают', () => {
    useCharacterStore.getState().setBaseAttributes(createInitialAttributes());
    useCharacterStore.getState().setBaseAttributes([{ name: 'STR', value: 8 }]);
    expect(Object.keys(useCharacterStore.getState().attributes)).toEqual(['STR']);
  });

  it('setBaseSkills — абсолютная запись: заменяет словарь целиком', () => {
    useCharacterStore.getState().setBaseSkills([
      { name: ALL_SKILLS[0].name, value: 6 },
      { name: ALL_SKILLS[1].name, value: 5 },
    ]);
    const { skills } = useCharacterStore.getState();
    expect(Object.keys(skills).sort()).toEqual([ALL_SKILLS[0].name, ALL_SKILLS[1].name].sort());
  });

  it('resetCharacterStore() без аргументов сеет дефолты (инвариант непустого словаря)', () => {
    useCharacterStore.getState().setBaseAttributes([{ name: 'STR', value: 8 }]);
    useCharacterStore.getState().resetCharacterStore();
    const { attributes, skills } = useCharacterStore.getState();
    expect(selectLegacyAttributes({ attributes })).toEqual(createInitialAttributes());
    expect(Object.keys(skills).length).toBe(ALL_SKILLS.length);
  });

  it('resetCharacterStore(legacyDefaults) использует переданные дефолты и чистит selection-списки', () => {
    const store = useCharacterStore.getState();
    store.setSelectedSkills(['barter']);
    store.setExtraTaggedSkills(['lockpick']);
    store.setForcedSelectedSkills(['melee']);
    store.resetCharacterStore({
      attributes: [{ name: 'STR', value: 6 }],
      skills: [{ name: ALL_SKILLS[0].name, value: 3 }],
    });
    const state = useCharacterStore.getState();
    expect(selectLegacyAttributes({ attributes: state.attributes })).toEqual([{ name: 'STR', value: 6 }]);
    expect(state.selectedSkills).toEqual([]);
    expect(state.extraTaggedSkills).toEqual([]);
    expect(state.forcedSelectedSkills).toEqual([]);
  });
});

describe('characterStore: selection-списки навыков (Шаг 5)', () => {
  it('начальные списки пусты', () => {
    const state = useCharacterStore.getState();
    expect(state.selectedSkills).toEqual([]);
    expect(state.extraTaggedSkills).toEqual([]);
    expect(state.forcedSelectedSkills).toEqual([]);
  });

  it('прямой сет списка (абсолютная запись)', () => {
    const store = useCharacterStore.getState();
    store.setSelectedSkills(['barter', 'science']);
    store.setExtraTaggedSkills(['lockpick']);
    store.setForcedSelectedSkills(['melee']);
    const state = useCharacterStore.getState();
    expect(state.selectedSkills).toEqual(['barter', 'science']);
    expect(state.extraTaggedSkills).toEqual(['lockpick']);
    expect(state.forcedSelectedSkills).toEqual(['melee']);
  });

  it('функциональный апдейтер prev => next (паттерн экрана)', () => {
    const store = useCharacterStore.getState();
    store.setSelectedSkills(['barter']);
    store.setSelectedSkills((prev) => [...prev, 'science']);
    store.setExtraTaggedSkills((prev) => prev.filter((s) => s !== 'lockpick'));
    store.setForcedSelectedSkills((prev) => [...new Set([...prev, 'melee'])]);
    const state = useCharacterStore.getState();
    expect(state.selectedSkills).toEqual(['barter', 'science']);
    expect(state.extraTaggedSkills).toEqual([]);
    expect(state.forcedSelectedSkills).toEqual(['melee']);
  });

  it('selection-списки входят в partialize (переживают rehydrate)', async () => {
    const store = useCharacterStore.getState();
    store.setSelectedSkills(['barter']);
    store.setForcedSelectedSkills(['melee']);
    await useCharacterStore.persist.rehydrate();
    const state = useCharacterStore.getState();
    expect(state.selectedSkills).toEqual(['barter']);
    expect(state.forcedSelectedSkills).toEqual(['melee']);
  });
});
