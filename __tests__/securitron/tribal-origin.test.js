/**
 * Ориджин «Дикарь» (Tribal) + фундамент пакетов правил.
 *
 * Дикарь — мультивыборный ориджин: 2 черты (Дикарь или Выживший) ИЛИ
 * 1 черта (Дикарь/Выживший/НКР) + 1 дополнительный перк.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import originsJson from '../../data/origins/origins.json';
import traitsJson from '../../data/traits/traits.json';
import ruOrigins from '../../i18n/ru-RU/data/system/origins.json';
import enOrigins from '../../i18n/en-EN/data/system/origins.json';
import ruTraits from '../../i18n/ru-RU/data/system/traits.json';
import enTraits from '../../i18n/en-EN/data/system/traits.json';
import { MULTI_TRAIT_ORIGIN_IDS } from '../../domain/characterCreation';
import { getBannedTagSkills, hasTraitEffect } from '../../domain/traits';
import { deepMerge, applyOverridesById, findUnknownOverrideIds } from '../../domain/packMerge';
import { migrateCharacterState } from '../../src/store/migrations';
import usePackStore from '../../src/store/packStore';
import { getOrigins, getTraits } from '../../domain/registry';

const getOrigin = () => originsJson.find((o) => o.id === 'tribal');
const getTrait = (id) => traitsJson.find((t) => t.id === id);

describe('Ориджин Дикарь: данные', () => {
  it('ориджин: human, humanoid, мульти-трейт, стандартный комплект', () => {
    const origin = getOrigin();
    expect(origin).toBeDefined();
    expect(origin.characterType).toBe('human');
    expect(origin.bodyPlan).toBe('humanoid');
    expect(origin.traitIds).toEqual(['tribal-tribal']);
    expect(origin.equipmentKitIds).toEqual(['default_caps_only']);
  });

  it('включён в список мульти-трейт ориджинов', () => {
    expect(MULTI_TRAIT_ORIGIN_IDS).toContain('tribal');
  });

  it('обёртка: isMultiTrait + 5 под-трейтов', () => {
    const wrapper = getTrait('tribal-tribal');
    expect(wrapper.modifiers.isMultiTrait).toBe(true);
    expect(wrapper.modifiers.subTraitIds).toEqual([
      'tribal-mother-wasteland',
      'tribal-nomad',
      'tribal-rite-of-passage',
      'tribal-old-world-tools',
      'tribal-chosen-one',
    ]);
  });

  it('все под-трейты существуют и переведены (ru/en)', () => {
    for (const id of getTrait('tribal-tribal').modifiers.subTraitIds) {
      expect(getTrait(id), id).toBeDefined();
      const ru = ruTraits.traits.tribal?.[id.replace('tribal-', '')];
      const en = enTraits.traits.tribal?.[id.replace('tribal-', '')];
      // ключи в i18n используют camelCase: motherWasteland, riteOfPassage и т.д.
      const camel = id
        .replace('tribal-', '')
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      expect(ruTraits.traits.tribal[camel]?.name, `ru ${id}`).toBeTruthy();
      expect(enTraits.traits.tribal[camel]?.name, `en ${id}`).toBeTruthy();
      void ru; void en;
    }
    expect(ruOrigins.tribal).toBe('Дикарь');
    expect(enOrigins.tribal).toBe('Tribal');
  });

  it('Кочевник запрещает отметку «Наука»', () => {
    const nomad = getTrait('tribal-nomad');
    expect(nomad.modifiers.bannedTagSkills).toEqual(['SCIENCE']);
    // Хелпер собирает запреты из выбранных трейтов
    const trait = { id: 'tribal-tribal', ids: ['tribal-tribal', 'tribal-nomad'] };
    expect(getBannedTagSkills(trait)).toContain('SCIENCE');
  });

  it('Обряд Посвящения помечен эффектом rite_of_passage', () => {
    const rite = getTrait('tribal-rite-of-passage');
    expect(rite.modifiers.effects).toContain('rite_of_passage');
    const trait = { id: 'tribal-tribal', ids: ['tribal-tribal', 'tribal-rite-of-passage'] };
    expect(hasTraitEffect(trait, 'rite_of_passage')).toBe(true);
    expect(hasTraitEffect(trait, 'nope')).toBe(false);
  });
});

describe('Фундамент пакетов правил: deepMerge', () => {
  it('объекты сливаются рекурсивно, примитивы заменяются, массивы целиком', () => {
    const base = {
      modifiers: {
        attributes: { STR: { baseBonus: 2, min: 6, max: 12 }, INT: { max: 6 } },
        skillMaxValue: 4,
        immunities: ['radiation', 'poison'],
      },
    };
    const override = {
      modifiers: {
        attributes: { STR: { max: 14 }, INT: { max: 4 } },
        skillMaxValue: 6,
        immunities: ['radiation'],
      },
    };
    const merged = deepMerge(base, override);
    expect(merged.modifiers.attributes.STR).toEqual({ baseBonus: 2, min: 6, max: 14 });
    expect(merged.modifiers.attributes.INT).toEqual({ max: 4 });
    expect(merged.modifiers.skillMaxValue).toBe(6);
    expect(merged.modifiers.immunities).toEqual(['radiation']); // массив заменён
  });

  it('base не мутируется', () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { c: 2 } });
    expect(base.a).toEqual({ b: 1 });
  });

  it('null/undefined override — возвращает base', () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });
});

describe('Фундамент пакетов правил: applyOverridesById', () => {
  it('override по id применяется, остальные записи не тронуты', () => {
    const traits = [
      { id: 'supermutant-forced-evolution', modifiers: { skillMaxValue: 4 } },
      { id: 'tribal-tribal', modifiers: { isMultiTrait: true } },
    ];
    const out = applyOverridesById(traits, {
      'supermutant-forced-evolution': { modifiers: { skillMaxValue: 6 } },
    });
    expect(out[0].modifiers.skillMaxValue).toBe(6);
    expect(out[1]).toBe(traits[1]); // не тронут
  });

  it('findUnknownOverrideIds находит несуществующие id', () => {
    const traits = [{ id: 'a' }];
    expect(findUnknownOverrideIds(traits, { a: {}, b: {} })).toEqual(['b']);
    expect(findUnknownOverrideIds(traits, { a: {} })).toEqual([]);
  });
});

describe('Фундамент пакетов правил: packStore', () => {
  beforeEach(() => {
    usePackStore.getState().clearPack();
  });

  it('setPack/clearPack и persist-частичное сохранение', () => {
    usePackStore.getState().setPack({ id: 'client-alfa', version: 1, overrides: {} });
    expect(usePackStore.getState().pack?.id).toBe('client-alfa');
    expect(usePackStore.persist.getOptions().partialize(usePackStore.getState())).toEqual({
      pack: { id: 'client-alfa', version: 1, overrides: {} },
    });
    usePackStore.getState().clearPack();
    expect(usePackStore.getState().pack).toBeNull();
  });

  it('setPack игнорирует пакет без id', () => {
    usePackStore.getState().setPack({ version: 1 });
    expect(usePackStore.getState().pack).toBeNull();
  });
});

describe('Переименование savage → tribal', () => {
  it('MULTI_TRAIT_ORIGIN_IDS вычисляется из данных (не хардкод): содержит tribal, не содержит savage', () => {
    expect(MULTI_TRAIT_ORIGIN_IDS).toContain('tribal');
    expect(MULTI_TRAIT_ORIGIN_IDS).not.toContain('savage');
    // производный: каждый id — ориджин (база + модуль), чей первый трейт isMultiTrait
    const allOrigins = getOrigins();
    const allTraits = getTraits();
    for (const id of MULTI_TRAIT_ORIGIN_IDS) {
      const origin = allOrigins.find((o) => o.id === id);
      const trait = allTraits.find((t) => t.id === origin?.traitIds?.[0]);
      expect(trait?.modifiers?.isMultiTrait, id).toBe(true);
    }
  });

  it('миграция v5→v6: сейв с origin savage → tribal (объект и строка)', () => {
      const obj = migrateCharacterState({ schemaVersion: 5, origin: { id: 'savage' } });
    expect(obj.origin.id).toBe('tribal');
    expect(obj.schemaVersion).toBe(8);
    const str = migrateCharacterState({ schemaVersion: 5, origin: 'savage' });
    expect(str.origin).toBe('tribal');
    // tribal не трогается
    const tribal = migrateCharacterState({ schemaVersion: 5, origin: { id: 'tribal' } });
    expect(tribal.origin.id).toBe('tribal');
  });
});
