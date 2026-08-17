import { describe, expect, it } from 'vitest';
import {
  buildCharacterDuplicate,
  createDuplicateCharacterId,
  createDuplicateCharacterName,
} from '../../domain/characterDuplication';

describe('universal character duplication domain', () => {
  it.each([
    {
      sourceName: 'Макс',
      copyLabel: 'копия',
      existingNames: ['Макс'],
      expected: 'Макс — копия',
    },
    {
      sourceName: 'Макс',
      copyLabel: 'копия',
      existingNames: ['Макс', 'Макс — копия'],
      expected: 'Макс — копия 2',
    },
    {
      sourceName: 'Max',
      copyLabel: 'copy',
      existingNames: ['Max', 'Max — copy', 'Max — copy 2'],
      expected: 'Max — copy 3',
    },
  ])('builds the localized collision-free name $expected', (input) => {
    expect(createDuplicateCharacterName(input)).toBe(input.expected);
  });

  it('changes only record identity, name, timestamps, and the canonical name value', () => {
    const source = {
      id: 'char_source',
      name: 'Max',
      level: 8,
      originName: 'vaultDweller',
      data: {
        characterName: 'Max',
        selectedPerks: [{ id: 'perk_1', effect: { id: 'effect_1' } }],
        inventory: {
          items: [{ id: 'item_1', uniqueId: 'instance_1', mods: [{ id: 'mod_1' }] }],
        },
      },
    };
    const original = JSON.parse(JSON.stringify(source));

    const duplicate = buildCharacterDuplicate({
      source,
      existingNames: ['Max'],
      copyLabel: 'copy',
      duplicateId: 'char_duplicate',
      timestamp: 1_765_432_100_000,
    });

    expect(duplicate).toEqual({
      id: 'char_duplicate',
      name: 'Max — copy',
      level: 8,
      originName: 'vaultDweller',
      data: {
        characterName: 'Max — copy',
        selectedPerks: [{ id: 'perk_1', effect: { id: 'effect_1' } }],
        inventory: {
          items: [{ id: 'item_1', uniqueId: 'instance_1', mods: [{ id: 'mod_1' }] }],
        },
      },
      createdAt: 1_765_432_100_000,
      updatedAt: 1_765_432_100_000,
    });
    expect(source).toEqual(original);
    expect(duplicate.data).not.toBe(source.data);
    expect(duplicate.data.selectedPerks).not.toBe(source.data.selectedPerks);
    expect(duplicate.data.inventory.items[0]).not.toBe(source.data.inventory.items[0]);
  });

  it('creates a new character-record id from injected values', () => {
    expect(createDuplicateCharacterId(1_765_432_100_000, 'abc123'))
      .toBe('char_1765432100000_abc123');
  });

  it('rejects inconsistent persisted name data instead of normalizing it', () => {
    expect(() => buildCharacterDuplicate({
      source: {
        id: 'char_source',
        name: 'Max',
        level: 1,
        originName: null,
        data: { characterName: 'Other name' },
      },
      existingNames: ['Max'],
      copyLabel: 'copy',
      duplicateId: 'char_duplicate',
      timestamp: 123,
    })).toThrow('source name and data.characterName must match');
  });
});
