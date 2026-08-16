/**
 * Миграции v9 -> v10 -> v11 (патчи 121c/121d): ориджин «Тень» — сброс атрибутов.
 *
 * Контекст: лимиты SPECIAL Тени не применялись (трейт использовал формат
 * attributeBonus/attributeLimits, который движок не читал; исправлено на
 * канонический attributes). Уже созданные персонажи-Тени могли иметь
 * атрибуты ВНЕ лимитов (STR/END <6 или >12, CHA/INT >8).
 *
 * Решение владельца: ПОЛНЫЙ сброс всех атрибутов Тени к стартовым —
 * STR/END = 6 (4 + бонус 2), остальные = 4; очки возвращаются в пул.
 * Навыки и остальные данные НЕ трогаются.
 *
 * ВАЖНО: атрибуты в сейве — МАССИВ [{ name, value }]. Первая версия
 * миграции v9->v10 обрабатывала их как словарь и ломала формат
 * (attributes.find is not a function) — v10->v11 чинит повреждённые сейвы.
 */
import { describe, it, expect } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const makeShadowSave = (attrs, version = 9) => ({
  schemaVersion: version,
  origin: { id: 'shadow' },
  trait: { id: 'shadow' },
  attributes: attrs,
  skills: { SNEAK: { id: 'SNEAK', base: 4, modifiers: [], total: 4 } },
  level: 1,
});

const attrArr = (name, value) => ({ name, value });

describe('Миграция v11→v12: полный сброс распределения (атрибуты + навыки)', () => {
  it('CURRENT_SCHEMA_VERSION = 12', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(12);
  });

  it('Тень: attributesSaved/skillsSaved = false, навыки к стартовым (tagged 2, иные 0)', () => {
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

    expect(migrated.attributesSaved).toBe(false);
    expect(migrated.skillsSaved).toBe(false);
    const byName = Object.fromEntries(migrated.skills.map((s) => [s.name, s.value]));
    expect(byName.SNEAK).toBe(2);          // отмеченный (tagged)
    expect(byName.MELEE_WEAPONS).toBe(0);  // не отмеченный
    expect(byName.SCIENCE).toBe(0);
    // инвентарь, уровень, выбор отмеченных — не тронуты
    expect(migrated.equipment.items).toEqual([{ id: 'weapon_x' }]);
    expect(migrated.level).toBe(2);
    expect(migrated.selectedSkills).toEqual(['SNEAK']);
  });

  it('не-Тень: флаги и навыки не тронуты', () => {
    const save = {
      schemaVersion: 11,
      origin: { id: 'vaultDweller' },
      trait: { id: 'x' },
      attributesSaved: true,
      skillsSaved: true,
      skills: [{ name: 'SNEAK', value: 5 }],
    };
    const migrated = migrateCharacterState(save);
    expect(migrated.attributesSaved).toBe(true);
    expect(migrated.skillsSaved).toBe(true);
    expect(migrated.skills[0].value).toBe(5);
  });
});

describe('Полная цепочка v9→v12 для Тени', () => {
  it('сейв v9 (массив) → атрибуты стартовые, флаги false, навыки стартовые, инвентарь цел', () => {
    const save = {
      schemaVersion: 9,
      origin: { id: 'shadow' },
      trait: { id: 'shadow' },
      attributesSaved: true,
      skillsSaved: true,
      selectedSkills: ['SNEAK'],
      extraTaggedSkills: [],
      attributes: [
        { name: 'STR', value: 10 }, { name: 'END', value: 3 },
        { name: 'PER', value: 7 }, { name: 'AGI', value: 4 },
        { name: 'INT', value: 9 }, { name: 'CHA', value: 10 }, { name: 'LCK', value: 5 },
      ],
      skills: [
        { name: 'SNEAK', value: 5 }, { name: 'MELEE_WEAPONS', value: 4 },
      ],
      equipment: { items: [{ id: 'weapon_x' }] },
      level: 3,
    };
    const migrated = migrateCharacterState(save);

    expect(migrated.schemaVersion).toBe(12);
    expect(Array.isArray(migrated.attributes)).toBe(true);
    const attrs = Object.fromEntries(migrated.attributes.map((a) => [a.name, a.value]));
    expect(attrs.STR).toBe(6);
    expect(attrs.END).toBe(6);
    expect(attrs.PER).toBe(4);
    expect(attrs.CHA).toBe(4);
    expect(migrated.attributesSaved).toBe(false);
    expect(migrated.skillsSaved).toBe(false);
    const skills = Object.fromEntries(migrated.skills.map((s) => [s.name, s.value]));
    expect(skills.SNEAK).toBe(2);
    expect(skills.MELEE_WEAPONS).toBe(0);
    expect(migrated.equipment.items).toEqual([{ id: 'weapon_x' }]);
    expect(migrated.level).toBe(3);
  });
});

  it('персонаж-Тень (v9, массив): все атрибуты сброшены к стартовым', () => {
    const save = makeShadowSave([
      attrArr('STR', 10),
      attrArr('END', 3),
      attrArr('PER', 7),
      attrArr('AGI', 4),
      attrArr('INT', 9),
      attrArr('CHA', 10),
      attrArr('LCK', 5),
    ]);
    const migrated = migrateCharacterState(save);

    // результат — МАССИВ (формат сейва), значения сброшены
    expect(Array.isArray(migrated.attributes)).toBe(true);
    const byName = Object.fromEntries(migrated.attributes.map((a) => [a.name, a.value]));
    expect(byName.STR).toBe(6);
    expect(byName.END).toBe(6);
    expect(byName.PER).toBe(4);
    expect(byName.AGI).toBe(4);
    expect(byName.INT).toBe(4);
    expect(byName.CHA).toBe(4);
    expect(byName.LCK).toBe(4);
    expect(migrated.schemaVersion).toBe(11);
  });

  it('навыки не трогаются', () => {
    const save = makeShadowSave([
      attrArr('STR', 10), attrArr('END', 10), attrArr('PER', 4),
      attrArr('AGI', 4), attrArr('INT', 4), attrArr('CHA', 4), attrArr('LCK', 4),
    ]);
    const migrated = migrateCharacterState(save);
    expect(migrated.skills.SNEAK).toEqual({ id: 'SNEAK', base: 4, modifiers: [], total: 4 });
    expect(migrated.level).toBe(1);
  });

  it('персонаж НЕ Тень — атрибуты не тронуты', () => {
    const save = {
      schemaVersion: 9,
      origin: { id: 'vaultDweller' },
      trait: { id: 'vault-dweller-trait' },
      attributes: [
        attrArr('STR', 8), attrArr('END', 5), attrArr('PER', 4),
        attrArr('AGI', 6), attrArr('INT', 7), attrArr('CHA', 3), attrArr('LCK', 9),
      ],
    };
    const migrated = migrateCharacterState(save);
    expect(Array.isArray(migrated.attributes)).toBe(true);
    expect(migrated.attributes.find((a) => a.name === 'STR').value).toBe(8);
    expect(migrated.attributes.find((a) => a.name === 'LCK').value).toBe(9);
  });
});

describe('Миграция v10→v11: починка повреждённых сейвов', () => {
  it('attributes-объект (баг v9→v10) → восстановлен массив + сброс Тени', () => {
    // повреждённый сейв: attributes = { '0': {name, value}, ... }
    const broken = makeShadowSave({
      '0': attrArr('STR', 10),
      '1': attrArr('END', 3),
      '2': attrArr('PER', 7),
      '3': attrArr('AGI', 4),
      '4': attrArr('INT', 9),
      '5': attrArr('CHA', 10),
      '6': attrArr('LCK', 5),
    }, 10);
    const migrated = migrateCharacterState(broken);

    expect(Array.isArray(migrated.attributes)).toBe(true);
    const byName = Object.fromEntries(migrated.attributes.map((a) => [a.name, a.value]));
    expect(byName.STR).toBe(6);
    expect(byName.END).toBe(6);
    expect(byName.INT).toBe(4);
    expect(byName.CHA).toBe(4);
    expect(migrated.schemaVersion).toBe(11);
  });

  it('повреждённый сейв НЕ Тени: массив восстановлен, значения сохранены', () => {
    const broken = {
      schemaVersion: 10,
      origin: { id: 'vaultDweller' },
      trait: { id: 'x' },
      attributes: { '0': attrArr('STR', 8), '1': attrArr('LCK', 9) },
    };
    const migrated = migrateCharacterState(broken);
    expect(Array.isArray(migrated.attributes)).toBe(true);
    expect(migrated.attributes.find((a) => a.name === 'STR').value).toBe(8);
    expect(migrated.attributes.find((a) => a.name === 'LCK').value).toBe(9);
  });

  it('не-атрибутный объект не трогается', () => {
    const save = { schemaVersion: 10, origin: { id: 'shadow' }, attributes: { foo: 'bar' } };
    const migrated = migrateCharacterState(save);
    expect(migrated.attributes).toEqual({ foo: 'bar' });
  });

  it('Тень без атрибутов — не падает', () => {
    const save = { schemaVersion: 9, origin: { id: 'shadow' }, trait: { id: 'shadow' } };
    const migrated = migrateCharacterState(save);
    expect(migrated.attributes).toBeUndefined();
  });
});

describe('Миграция v12→v13: трейт Тени в сейве (старый формат modifiers)', () => {
  it('CURRENT_SCHEMA_VERSION = 13', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(13);
  });

  it('сейв как у пользователя: трейт в старом формате → починен, атрибуты 6/6/4..., флаги false', () => {
    const save = {
      schemaVersion: 12,
      origin: { id: 'shadow' },
      trait: {
        ids: ['shadow'], id: 'shadow', name: 'Тень',
        modifiers: {
          attributeBonus: { STR: 2, END: 2 },
          attributeLimits: { STR: { min: 6, max: 12 }, END: { min: 6, max: 12 }, CHA: { max: 8 }, INT: { max: 8 } },
          skillMaxValue: 4,
          immunities: ['radiation', 'poison'],
          effects: ['stealth_boy_addiction'],
        },
      },
      attributesSaved: false,
      skillsSaved: false,
      attributes: [
        { name: 'STR', value: 4 }, { name: 'END', value: 4 }, { name: 'PER', value: 4 },
        { name: 'AGI', value: 4 }, { name: 'INT', value: 4 }, { name: 'CHA', value: 4 }, { name: 'LCK', value: 4 },
      ],
      skills: [
        { name: 'SNEAK', value: 0 }, { name: 'ATHLETICS', value: 0 },
      ],
      equipment: { items: [{ id: 'unarmed_human', isBuiltin: true }] },
      level: 1,
    };
    const migrated = migrateCharacterState(save);

    expect(migrated.schemaVersion).toBe(13);
    // трейт починен: канонический attributes, старый формат удалён
    expect(migrated.trait.modifiers.attributes.STR).toEqual({ baseBonus: 2, min: 6, max: 12 });
    expect(migrated.trait.modifiers.attributeBonus).toBeUndefined();
    expect(migrated.trait.modifiers.attributeLimits).toBeUndefined();
    expect(migrated.trait.modifiers.skillMaxValue).toBe(4);
    // атрибуты сброшены к стартовым
    const attrs = Object.fromEntries(migrated.attributes.map((a) => [a.name, a.value]));
    expect(attrs.STR).toBe(6);
    expect(attrs.END).toBe(6);
    expect(attrs.PER).toBe(4);
    expect(migrated.attributesSaved).toBe(false);
    expect(migrated.skillsSaved).toBe(false);
    // навыки к стартовым
    expect(migrated.skills[0].value).toBe(0);
    // инвентарь и уровень целы
    expect(migrated.equipment.items).toEqual([{ id: 'unarmed_human', isBuiltin: true }]);
    expect(migrated.level).toBe(1);
  });

  it('трейт уже канонический — сейв не трогаем (защита от повторного сброса)', () => {
    const save = {
      schemaVersion: 12,
      origin: { id: 'shadow' },
      trait: { id: 'shadow', modifiers: { attributes: { STR: { baseBonus: 2, min: 6, max: 12 } }, skillMaxValue: 4 } },
      attributesSaved: true,
      skillsSaved: true,
      attributes: [{ name: 'STR', value: 8 }],
      skills: [{ name: 'SNEAK', value: 4 }],
    };
    const migrated = migrateCharacterState(save);
    expect(migrated.trait.modifiers.attributes.STR.baseBonus).toBe(2);
    expect(migrated.attributes[0].value).toBe(8); // не сброшено
    expect(migrated.attributesSaved).toBe(true);
  });
});

describe('Миграция v13→v14: старый комплект → NIGHTKIN', () => {
  it('CURRENT_SCHEMA_VERSION = 14', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(14);
  });

  it('Тень со стартовым капиталом: комплект заменён на nightkin, флаг pending', () => {
    const save = {
      schemaVersion: 13,
      origin: { id: 'shadow' },
      trait: { id: 'shadow' },
      equipment: { id: 'default_caps_only', name: 'Стартовый капитал', items: [{ itemType: 'currency', quantity: 100 }] },
      caps: 100,
    };
    const migrated = migrateCharacterState(save);
    expect(migrated.equipment.id).toBe('nightkin');
    expect(migrated.equipment.name).toBe('Тень');
    expect(migrated.nightkinKitPending).toBe(true);
  });

  it('Тень с уже новым комплектом: не трогаем', () => {
    const save = {
      schemaVersion: 13,
      origin: { id: 'shadow' },
      equipment: { id: 'nightkin', name: 'Тень', items: [] },
    };
    const migrated = migrateCharacterState(save);
    expect(migrated.equipment.id).toBe('nightkin');
    expect(migrated.nightkinKitPending).toBeUndefined();
  });

  it('не-Тень: комплект не тронут', () => {
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
