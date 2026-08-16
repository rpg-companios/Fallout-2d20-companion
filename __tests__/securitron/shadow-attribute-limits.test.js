/**
 * Срочный фикс (патч 121): ориджин «Тень» (shadow) — ограничения SPECIAL.
 *
 * Проблема: трейт Тень объявлял бонусы/лимиты в формате
 * `modifiers.attributeBonus` + `modifiers.attributeLimits`, который движок
 * (getAttributeLimits/getTraitAttributeBonus) НЕ читает — ограничения не
 * применялись (STR/END не были ограничены минимумом 6 и максимумом 12,
 * CHA/INT не были ограничены максимумом 8).
 *
 * Исправление: трейт переведён на канонический формат `modifiers.attributes`
 * (как у supermutant): { STR: { baseBonus: 2, min: 6, max: 12 }, ... }.
 * Движок поддерживает этот формат — лимиты и бонусы работают.
 */
import { describe, it, expect } from 'vitest';
import { getAttributeLimits, canChangeAttribute, getTraitAttributeBonus } from '../../domain/characterCreation';
import { getTraits } from '../../domain/registry';

const shadowTrait = getTraits().find((t) => t.id === 'shadow');
const limits = (attr) => getAttributeLimits(shadowTrait, attr);

describe('Тень: ограничения SPECIAL (канонический формат attributes)', () => {
  it('данные трейта — канонический формат (без attributeBonus/attributeLimits)', () => {
    expect(shadowTrait.modifiers.attributeBonus).toBeUndefined();
    expect(shadowTrait.modifiers.attributeLimits).toBeUndefined();
    expect(shadowTrait.modifiers.attributes.STR).toEqual({ baseBonus: 2, min: 6, max: 12 });
    expect(shadowTrait.modifiers.attributes.END).toEqual({ baseBonus: 2, min: 6, max: 12 });
    expect(shadowTrait.modifiers.attributes.CHA).toEqual({ max: 8 });
    expect(shadowTrait.modifiers.attributes.INT).toEqual({ max: 8 });
  });

  it('лимиты: STR/END 6–12, CHA/INT max 8, остальные — базовые', () => {
    expect(limits('STR')).toEqual({ min: 6, max: 12 });
    expect(limits('END')).toEqual({ min: 6, max: 12 });
    expect(limits('CHA').max).toBe(8);
    expect(limits('INT').max).toBe(8);
    expect(limits('PER')).toEqual({ min: 4, max: 10 }); // базовые
  });

  it('бонусы: STR/END +2 (baseBonus), остальные 0', () => {
    expect(getTraitAttributeBonus(shadowTrait.modifiers.attributes.STR)).toBe(2);
    expect(getTraitAttributeBonus(shadowTrait.modifiers.attributes.END)).toBe(2);
    expect(getTraitAttributeBonus(shadowTrait.modifiers.attributes.CHA)).toBe(0);
  });

  it('изменение атрибутов уважает лимиты', () => {
    expect(canChangeAttribute(6, 'STR', -1, shadowTrait)).toBe(false); // ниже min 6 нельзя
    expect(canChangeAttribute(12, 'STR', 1, shadowTrait)).toBe(false); // выше max 12 нельзя
    expect(canChangeAttribute(7, 'STR', 1, shadowTrait)).toBe(true);
    expect(canChangeAttribute(8, 'CHA', 1, shadowTrait)).toBe(false); // выше max 8 нельзя
    expect(canChangeAttribute(8, 'INT', 1, shadowTrait)).toBe(false);
  });
});
