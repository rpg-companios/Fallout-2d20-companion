import { describe, it, expect, vi } from 'vitest';

vi.mock('../../i18n/locale', () => ({ getCurrentLocale: () => 'ru-RU' }));

import {
  kitIsAvailableForTraits,
  filterKitsForCharacter,
} from '../../domain/equipmentKits';

const kits = [
  { id: 'kit_open' },
  { id: 'kit_chairmen', requiresTraitIds: ['treefamilies-chairmen'] },
  { id: 'kit_omerta', requiresTraitIds: ['treefamilies-omerta'] },
  { id: 'kit_two', requiresTraitIds: ['a', 'b'] },
];

describe('equipmentKits — единый фильтр комплектов по требованиям из данных', () => {
  it('без требования комплект доступен всегда', () => {
    expect(kitIsAvailableForTraits({ id: 'x' }, new Set())).toBe(true);
  });

  it('комплект с requiresTraitIds скрыт, пока нужный трейт не выбран', () => {
    expect(kitIsAvailableForTraits(kits[1], new Set())).toBe(false);
  });

  it('комплект показан, если выбран один из его требуемых трейтов', () => {
    expect(kitIsAvailableForTraits(kits[3], new Set(['a']))).toBe(true);
    expect(kitIsAvailableForTraits(kits[3], new Set(['b']))).toBe(true);
    expect(kitIsAvailableForTraits(kits[3], new Set(['c']))).toBe(false);
  });

  it('для семьи Председателей — только их комплект и общие', () => {
    const trait = { ids: ['treefamilies-chairmen'] };
    const ids = filterKitsForCharacter(kits, trait).map((k) => k.id);
    expect(ids).toEqual(['kit_open', 'kit_chairmen']);
  });

  it('для Омерты — только их комплект и общие', () => {
    const trait = { id: 'treefamilies-omerta' };
    const ids = filterKitsForCharacter(kits, trait).map((k) => k.id);
    expect(ids).toEqual(['kit_open', 'kit_omerta']);
  });

  it('без выбранного трейта видны только комплекты без требования', () => {
    expect(filterKitsForCharacter(kits, null).map((k) => k.id)).toEqual(['kit_open']);
  });

  it('пустой/отсутствующий список — пустой результат', () => {
    expect(filterKitsForCharacter([], null)).toEqual([]);
    expect(filterKitsForCharacter(undefined, null)).toEqual([]);
  });
});
