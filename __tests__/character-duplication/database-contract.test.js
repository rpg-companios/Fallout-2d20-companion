import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const database = fs.readFileSync(new URL('../../db/Database.js', import.meta.url), 'utf8');
const webDatabase = fs.readFileSync(new URL('../../db/Database.web.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../../db/schema.js', import.meta.url), 'utf8');
const sqliteAdapter = fs.readFileSync(new URL('../../db/adapters/SQLiteAdapter.js', import.meta.url), 'utf8');
const webAdapter = fs.readFileSync(new URL('../../db/adapters/WebAdapter.js', import.meta.url), 'utf8');
const characterContext = fs.readFileSync(new URL('../../components/CharacterContext.js', import.meta.url), 'utf8');

describe('character duplication persistence contract', () => {
  it('stores pending rename state separately from character data', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS character_rename_requests');
    expect(schema).toContain('character_id TEXT PRIMARY KEY');
  });

  it.each([database, webDatabase])('exposes duplication and rename-marker operations', (source) => {
    expect(source).toContain('function duplicateCharacter');
    expect(source).toContain('function clearCharacterRenameRequest');
    expect(source).toContain('buildCharacterDuplicate');
  });

  it.each([database, webDatabase])('creates the record, marker, and optional folder membership in one batch', (source) => {
    const duplicateBody = source.slice(
      source.indexOf('export async function duplicateCharacter'),
      source.indexOf('export async function clearCharacterRenameRequest'),
    );
    expect(duplicateBody).toContain('INSERT INTO characters');
    expect(duplicateBody).toContain('INSERT INTO character_rename_requests');
    expect(duplicateBody).toContain('INSERT INTO character_folder_memberships');
    expect(duplicateBody).toContain('await runBatch(statements)');
  });

  it('uses transactional/batched adapter writes on native and web', () => {
    expect(sqliteAdapter).toContain('withTransactionAsync');
    expect(webAdapter).toContain('AsyncStorage.multiSet(writes)');
  });

  it('restores rename-required mode and clears it only when Save succeeds', () => {
    expect(characterContext).toContain('const saved = !row.renamePending');
    expect(characterContext).toContain('await db.clearCharacterRenameRequest(id)');
  });
});
