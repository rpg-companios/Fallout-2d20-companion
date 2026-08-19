/**
 * Регрессии полной цепочки миграций персонажа-Тени.
 *
 * migrateCharacterState всегда проводит сейв до CURRENT_SCHEMA_VERSION,
 * поэтому ожидания ниже проверяют итог всей цепочки, включая более позднюю
 * замену старого комплекта на NIGHTKIN.
 */
import { describe, it, expect } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const attrArr = (name, value) => ({ name, value });

const makeShadowSave = (attributes, version = 9) => ({
  schemaVersion: version,
  origin: { id: 'shadow' },
  trait: { id: 'shadow' },
  attributes,
  skills: [{ name: 'SNEAK', value: 4 }],
  selectedSkills: ['SNEAK'],
  extraTaggedSkills: [],
  level: 1,
});

const byName = (entries) => Object.fromEntries(entries.map((entry) => [entry.name, entry.value]));

describe('Текущая версия формата сейва', () => {
  it('равна 15', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(16);
  });
});

describe('Полная цепочка от v11: сброс распределения Тени', () => {
  it('сбрасывает флаги/навыки, сохраняет прочие поля и применяет более позднюю миграцию комплекта', () => {
    const save = {
      schemaVersion: 11,
      origin: { id: 'shadow' },
      trait: { id: 'shadow' },
      attributesSaved: true,
      skillsSaved: true,
      selectedSkills: ['SNEAK'],
      extraTaggedSkills: [],
      skills: [
        { name: 'SNEAK', value: 5 },
        { name: 'MELEE_WEAPONS', value: 4 },
        { name: 'SCIENCE', value: 0 },
      ],
      equipment: { items: [{ id: 'weapon_x' }] },
      level: 2,
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.attributesSaved).toBe(false);
    expect(migrated.skillsSaved).toBe(false);
    expect(byName(migrated.skills)).toMatchObject({ SNEAK: 2, MELEE_WEAPONS: 0, SCIENCE: 0 });
    expect(migrated.selectedSkills).toEqual(['SNEAK']);
    expect(migrated.level).toBe(2);
    expect(migrated.equipment).toMatchObject({ id: 'nightkin', name: 'Тень', items: [] });
    expect(migrated.nightkinKitPending).toBe(true);
  });

  it('не меняет распределение не-Тени', () => {
    const save = {
      schemaVersion: 11,
      origin: { id: 'vaultDweller' },
      trait: { id: 'vault-dweller-trait' },
      attributesSaved: true,
      skillsSaved: true,
      skills: [{ name: 'SNEAK', value: 5 }],
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.attributesSaved).toBe(true);
    expect(migrated.skillsSaved).toBe(true);
    expect(migrated.skills[0].value).toBe(5);
  });
});

describe('Полная цепочка от v9: стартовые атрибуты Тени', () => {
  it('сбрасывает SPECIAL и навыки, сохраняя выбор навыков и уровень', () => {
    const save = {
      ...makeShadowSave([
        attrArr('STR', 10), attrArr('END', 3), attrArr('PER', 7),
        attrArr('AGI', 4), attrArr('INT', 9), attrArr('CHA', 10), attrArr('LCK', 5),
      ]),
      attributesSaved: true,
      skillsSaved: true,
      skills: [attrArr('SNEAK', 5), attrArr('MELEE_WEAPONS', 4)],
      equipment: { items: [{ id: 'weapon_x' }] },
      level: 3,
    };

    const migrated = migrateCharacterState(save);
    const attributes = byName(migrated.attributes);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(attributes).toMatchObject({ STR: 6, END: 6, PER: 4, AGI: 4, INT: 4, CHA: 4, LCK: 4 });
    expect(migrated.attributesSaved).toBe(false);
    expect(migrated.skillsSaved).toBe(false);
    expect(byName(migrated.skills)).toMatchObject({ SNEAK: 2, MELEE_WEAPONS: 0 });
    expect(migrated.selectedSkills).toEqual(['SNEAK']);
    expect(migrated.level).toBe(3);
    expect(migrated.equipment.id).toBe('nightkin');
    expect(migrated.nightkinKitPending).toBe(true);
  });

  it('не сбрасывает атрибуты не-Тени', () => {
    const save = {
      schemaVersion: 9,
      origin: { id: 'vaultDweller' },
      trait: { id: 'vault-dweller-trait' },
      attributes: [attrArr('STR', 8), attrArr('LCK', 9)],
    };

    const migrated = migrateCharacterState(save);

    expect(byName(migrated.attributes)).toEqual({ STR: 8, LCK: 9 });
  });
});

describe('Полная цепочка от v10: починка повреждённых attributes', () => {
  it('восстанавливает массив и повторно сбрасывает Тень', () => {
    const broken = makeShadowSave({
      0: attrArr('STR', 10),
      1: attrArr('END', 3),
      2: attrArr('PER', 7),
      3: attrArr('AGI', 4),
      4: attrArr('INT', 9),
      5: attrArr('CHA', 10),
      6: attrArr('LCK', 5),
    }, 10);

    const migrated = migrateCharacterState(broken);

    expect(Array.isArray(migrated.attributes)).toBe(true);
    expect(byName(migrated.attributes)).toMatchObject({ STR: 6, END: 6, INT: 4, CHA: 4 });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('восстанавливает массив не-Тени без изменения значений', () => {
    const broken = {
      schemaVersion: 10,
      origin: { id: 'vaultDweller' },
      trait: { id: 'vault-dweller-trait' },
      attributes: { 0: attrArr('STR', 8), 1: attrArr('LCK', 9) },
    };

    const migrated = migrateCharacterState(broken);

    expect(Array.isArray(migrated.attributes)).toBe(true);
    expect(byName(migrated.attributes)).toEqual({ STR: 8, LCK: 9 });
  });

  it('не принимает произвольный объект за массив атрибутов', () => {
    const save = { schemaVersion: 10, origin: { id: 'shadow' }, attributes: { foo: 'bar' } };
    expect(migrateCharacterState(save).attributes).toEqual({ foo: 'bar' });
  });

  it('не падает для Тени без атрибутов', () => {
    const save = { schemaVersion: 9, origin: { id: 'shadow' }, trait: { id: 'shadow' } };
    expect(migrateCharacterState(save).attributes).toBeUndefined();
  });
});

describe('Полная цепочка от v12: канонизация сохранённого трейта Тени', () => {
  it('переводит старые modifiers в attributes и сбрасывает распределение', () => {
    const save = {
      schemaVersion: 12,
      origin: { id: 'shadow' },
      trait: {
        ids: ['shadow'], id: 'shadow', name: 'Тень',
        modifiers: {
          attributeBonus: { STR: 2, END: 2 },
          attributeLimits: {
            STR: { min: 6, max: 12 }, END: { min: 6, max: 12 },
            CHA: { max: 8 }, INT: { max: 8 },
          },
          skillMaxValue: 4,
          immunities: ['radiation', 'poison'],
          effects: ['stealth_boy_addiction'],
        },
      },
      attributesSaved: true,
      skillsSaved: true,
      attributes: [
        attrArr('STR', 4), attrArr('END', 4), attrArr('PER', 4), attrArr('AGI', 4),
        attrArr('INT', 4), attrArr('CHA', 4), attrArr('LCK', 4),
      ],
      skills: [attrArr('SNEAK', 3), attrArr('ATHLETICS', 2)],
      equipment: { id: 'default_caps_only', items: [{ itemType: 'currency', quantity: 100 }] },
      level: 1,
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.trait.modifiers.attributes.STR).toEqual({ baseBonus: 2, min: 6, max: 12 });
    expect(migrated.trait.modifiers.attributeBonus).toBeUndefined();
    expect(migrated.trait.modifiers.attributeLimits).toBeUndefined();
    expect(migrated.trait.modifiers.skillMaxValue).toBe(4);
    expect(byName(migrated.attributes)).toMatchObject({ STR: 6, END: 6, PER: 4 });
    expect(migrated.attributesSaved).toBe(false);
    expect(migrated.skillsSaved).toBe(false);
    expect(byName(migrated.skills)).toEqual({ SNEAK: 0, ATHLETICS: 0 });
    expect(migrated.level).toBe(1);
    expect(migrated.equipment.id).toBe('nightkin');
    expect(migrated.nightkinKitPending).toBe(true);
  });

  it('не сбрасывает уже канонический трейт повторно', () => {
    const save = {
      schemaVersion: 12,
      origin: { id: 'shadow' },
      trait: { id: 'shadow', modifiers: { attributes: { STR: { baseBonus: 2, min: 6, max: 12 } }, skillMaxValue: 4 } },
      attributesSaved: true,
      skillsSaved: true,
      attributes: [attrArr('STR', 8)],
      skills: [attrArr('SNEAK', 4)],
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.trait.modifiers.attributes.STR.baseBonus).toBe(2);
    expect(migrated.attributes[0].value).toBe(8);
    expect(migrated.attributesSaved).toBe(true);
  });
});

describe('Миграция v13→v14: старый комплект → NIGHTKIN', () => {
  it('заменяет стартовый капитал Тени и ставит pending-флаг', () => {
    const save = {
      schemaVersion: 13,
      origin: { id: 'shadow' },
      trait: { id: 'shadow' },
      equipment: { id: 'default_caps_only', name: 'Стартовый капитал', items: [{ itemType: 'currency', quantity: 100 }] },
      caps: 100,
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.equipment).toMatchObject({ id: 'nightkin', name: 'Тень', items: [] });
    expect(migrated.nightkinKitPending).toBe(true);
  });

  it('не трогает уже новый комплект', () => {
    const save = {
      schemaVersion: 13,
      origin: { id: 'shadow' },
      equipment: { id: 'nightkin', name: 'Тень', items: [] },
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.equipment.id).toBe('nightkin');
    expect(migrated.nightkinKitPending).toBeUndefined();
  });

  it('не трогает комплект не-Тени', () => {
    const save = {
      schemaVersion: 13,
      origin: { id: 'vaultDweller' },
      equipment: { id: 'vault_resident', name: 'Житель Убежища' },
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.equipment.id).toBe('vault_resident');
    expect(migrated.nightkinKitPending).toBeUndefined();
  });
});
