// ПРИЁМОЧНЫЙ (патч 551): дальность оружия не «падает» от модов.
//
// Жалоба владельца: «короткий оптический прицел на охотничьей винтовке снижал
// дистанцию». Причина: в i18n-каталоге оружия поле `rangeName` — ЛОКАЛИЗОВАННЫЙ
// текст («Средняя»), а конвейер модов читал его раньше машинной буквы `range`
// ('M') и, не распознав строку, подставлял индекс 0 — «Близкая». Так ЛЮБОЙ мод
// (даже без rangeModifier, как «Короткий оптический») понижал дальность.
//
// Закон: механика читает только машинные источники (буква/каноническое имя/
// индекс), локализованный текст — только для отображения. Мод без
// rangeModifier не меняет дальность; мод с rangeModifier сдвигает её на шаги.
import { describe, expect, it } from 'vitest';

import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { applyWeaponMods, enrichWeaponItem } from '../../domain/enrichItem';
import {
  baseRangeIndex,
  rangeToIndex,
  rangeToName,
  resolveWeaponRangeFields,
} from '../../domain/range';

const catalog = getEquipmentCatalog('ru-RU');
const weaponById = (id) => catalog.weapons.find((w) => w.id === id);
const modById = (id) => catalog.weaponMods.find((m) => m.id === id);

const enrich = (weaponId, appliedMods = {}) =>
  enrichWeaponItem({ id: 'instance', weaponId, appliedMods }, catalog);

describe('Патч 551: «Короткий оптический» на охотничьей винтовке', () => {
  it('данные: у винтовки машинная буква M и локализованный rangeName', () => {
    const base = weaponById('weapon_hunting_rifle');
    expect(base.range).toBe('M');
    expect(base.rangeName).toBe('Средняя'); // локализованный текст — не механика
    expect(baseRangeIndex(base)).toBe(rangeToIndex('M'));
  });

  it('«Короткий оптический» не имеет rangeModifier', () => {
    const mod = modById('mod_short_scope');
    expect(mod).toBeTruthy();
    expect(mod.rangeModifier).toBeUndefined();
  });

  it('установка прицела НЕ понижает дальность: остаётся «Средняя»', () => {
    const before = enrich('weapon_hunting_rifle');
    const after = enrich('weapon_hunting_rifle', { Sight: 'mod_short_scope' });

    expect(baseRangeIndex(before)).toBe(rangeToIndex('M'));
    expect(after.range_index).toBe(rangeToIndex('M'));
    expect(after.range_name).toBe('Medium');
    expect(after.range_index).not.toBe(rangeToIndex('C'));
  });

  it('любой мод без rangeModifier на этой винтовке дальность не меняет', () => {
    const baseIndex = baseRangeIndex(weaponById('weapon_hunting_rifle'));
    const applicable = catalog.weaponMods
      .filter((m) => (m.applies_to_ids || []).includes('weapon_hunting_rifle'))
      .filter((m) => !m.rangeModifier);
    expect(applicable.length).toBeGreaterThan(0);

    for (const mod of applicable) {
      const result = enrich('weapon_hunting_rifle', { [mod.slot]: mod.id });
      expect({ mod: mod.id, range: result.range_index }).toEqual({ mod: mod.id, range: baseIndex });
    }
  });

  it('мод с rangeModifier сдвигает дальность на шаг: +1 → «Дальняя»', () => {
    // «Длинный ствол» (+1 к дальности) подходит охотничьей винтовке.
    const longBarrel = catalog.weaponMods.find(
      (m) => m.rangeModifier?.op === '+' && (m.applies_to_ids || []).includes('weapon_hunting_rifle'),
    );
    expect(longBarrel).toBeTruthy();
    const result = enrich('weapon_hunting_rifle', { [longBarrel.slot]: longBarrel.id });
    expect(result.range_index).toBe(rangeToIndex('M') + Number(longBarrel.rangeModifier.value));
    expect(result.range_name).not.toBe('Close');
  });
});

describe('Патч 551: источники дальности', () => {
  it('resolveWeaponRangeFields: буква важнее локализованного rangeName', () => {
    expect(resolveWeaponRangeFields({ range: 'M', rangeName: 'Средняя' }))
      .toEqual({ range_index: 1, range_name: 'Medium' });
    expect(resolveWeaponRangeFields({ range: 'L', rangeName: 'Дальняя' }))
      .toEqual({ range_index: 2, range_name: 'Long' });
  });

  it('каноническое имя всё ещё распознаётся, локализованное — нет', () => {
    expect(baseRangeIndex({ rangeName: 'Medium' })).toBe(1);
    expect(baseRangeIndex({ rangeName: 'Средняя' })).toBeNull();
    expect(baseRangeIndex({ range_name: 'Long' })).toBe(2);
    expect(rangeToName('M')).toBe('Medium');
  });

  it('ближний бой: дальность не выдумывается', () => {
    const mod = catalog.weaponMods.find((m) => (m.applies_to_ids || []).includes('weapon_sword'));
    expect(mod).toBeTruthy();
    const result = applyWeaponMods(weaponById('weapon_sword'), [mod]);
    expect(result.range_index).toBeUndefined();
    expect(result.range_name).toBeUndefined();
  });
});
