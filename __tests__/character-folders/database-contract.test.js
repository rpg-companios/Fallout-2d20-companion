import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const database = fs.readFileSync(new URL('../../db/Database.js', import.meta.url), 'utf8');
const webDatabase = fs.readFileSync(new URL('../../db/Database.web.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../../db/schema.js', import.meta.url), 'utf8');

describe('character folder persistence contract', () => {
  it('defines the folder entities in the shared schema', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS character_folders');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS character_folder_memberships');
  });

  it.each([database, webDatabase])('exposes the documented operations in both adapters', (source) => {
    [
      'getCharacterFolders', 'createCharacterFolder', 'renameCharacterFolder',
      'deleteCharacterFolderAndCharacters', 'getCharacterFolderId', 'moveCharacterToFolder',
      'getRootCharactersList', 'getCharactersInFolder',
    ].forEach((operation) => expect(source).toContain(`function ${operation}`));
  });

  it('removes a character membership when the character is deleted', () => {
    expect(database).toContain('DELETE FROM character_folder_memberships WHERE character_id = ?');
    expect(webDatabase).toContain('DELETE FROM character_folder_memberships WHERE character_id = ?');
  });
});
