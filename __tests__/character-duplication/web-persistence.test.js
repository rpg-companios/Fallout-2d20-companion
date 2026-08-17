import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../../db/Database.web';

const insertCharacter = async ({
  id,
  name,
  createdAt,
  data = { characterName: name },
}) => {
  await db.runQuery(
    `INSERT INTO characters
      (id, name, level, origin_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, 8, 'vaultDweller', JSON.stringify(data), createdAt, createdAt],
  );
};

describe('web character duplication persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    vi.restoreAllMocks();
  });

  it('atomically writes an exact nested copy, rename marker, and source folder placement', async () => {
    const sourceData = {
      characterName: 'Max',
      selectedPerks: [{ id: 'perk_1', effect: { id: 'effect_1' } }],
      inventory: { items: [{ id: 'item_1', uniqueId: 'instance_1' }] },
    };
    await insertCharacter({ id: 'char_source', name: 'Max', createdAt: 10, data: sourceData });
    await insertCharacter({ id: 'char_existing_copy', name: 'Max — copy', createdAt: 11 });
    await db.runQuery(
      'INSERT INTO character_folders (id, name, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?)',
      ['folder_1', 'Party', 1, 1, 0],
    );
    await db.runQuery(
      'INSERT INTO character_folder_memberships (character_id, folder_id) VALUES (?, ?)',
      ['char_source', 'folder_1'],
    );
    const multiSet = vi.spyOn(AsyncStorage, 'multiSet');

    const duplicate = await db.duplicateCharacter('char_source', 'copy');

    expect(duplicate.name).toBe('Max — copy 2');
    expect(multiSet).toHaveBeenCalledTimes(1);
    expect(multiSet.mock.calls[0][0].map(([key]) => key).sort()).toEqual([
      'fallout_db_character_folder_memberships',
      'fallout_db_character_rename_requests',
      'fallout_db_characters',
    ]);

    const loaded = await db.loadCharacterById(duplicate.id);
    expect(loaded.renamePending).toBe(true);
    expect(loaded.created_at).toBe(duplicate.createdAt);
    expect(loaded.updated_at).toBe(duplicate.updatedAt);
    expect(loaded.data).toEqual({ ...sourceData, characterName: 'Max — copy 2' });
    expect(await db.getCharacterFolderId(duplicate.id)).toBe('folder_1');

    await db.clearCharacterRenameRequest(duplicate.id);
    expect((await db.loadCharacterById(duplicate.id)).renamePending).toBe(false);
  });

  it('keeps a root character duplicate at root', async () => {
    await insertCharacter({ id: 'char_root', name: 'Макс', createdAt: 20 });

    const duplicate = await db.duplicateCharacter('char_root', 'копия');

    expect(duplicate.name).toBe('Макс — копия');
    expect(await db.getCharacterFolderId(duplicate.id)).toBeNull();
    expect((await db.getRootCharactersList()).map((character) => character.id))
      .toContain(duplicate.id);
  });
});
