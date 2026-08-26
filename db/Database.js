import { Platform } from 'react-native';
import {
  buildCharacterDuplicate,
  createDuplicateCharacterId,
} from '../domain/characterDuplication';
import {
  catalogGetWeapons, catalogGetWeaponById, catalogSearchWeapons, catalogGetWeaponByName,
  catalogGetWeaponMods, catalogGetWeaponModById, catalogGetModsForWeaponSlot, catalogGetSlotsForWeapon,
  catalogGetAmmoTypes, catalogGetAmmoById,
  catalogGetWeaponQualities, catalogGetQualityByName,
  catalogGetPerks, catalogGetItems, catalogGetItemByName, catalogRowCount,
} from './catalogSource';

let adapter;

if (Platform.OS === 'web') {
  adapter = require('./adapters/WebAdapter');
} else {
  adapter = require('./adapters/SQLiteAdapter');
}

export const { initDatabase, runQuery, getAll, getFirst, runBatch, tableExists } = adapter;

// getRowCount: каталог теперь в JSON (не в БД). Возвращаем число записей каталога,
// чтобы старые проверки «засеяна ли БД» продолжали работать (всегда > 0).
export async function getRowCount() {
  return catalogRowCount();
}

// ─── Оружие (из JSON-каталога) ──────────────────────────────────────────────

export async function getWeapons(weaponType = null) {
  return catalogGetWeapons(weaponType);
}

export async function getWeaponById(id) {
  return catalogGetWeaponById(id);
}

export async function searchWeapons(query) {
  return catalogSearchWeapons(query);
}

export async function getWeaponByName(name) {
  return catalogGetWeaponByName(name);
}

// ─── Модификации оружия ────────────────────────────────────────────────────────

export async function getWeaponMods(weaponId = null) {
  return catalogGetWeaponMods(weaponId);
}

export async function getWeaponModById(id) {
  return catalogGetWeaponModById(id);
}

export async function getModsForWeaponSlot(weaponId, slot) {
  return catalogGetModsForWeaponSlot(weaponId, slot);
}

export async function getSlotsForWeapon(weaponId) {
  return catalogGetSlotsForWeapon(weaponId);
}

// ─── Патроны ──────────────────────────────────────────────────────────────────

export async function getAmmoTypes() {
  return catalogGetAmmoTypes();
}

export async function getAmmoById(id) {
  return catalogGetAmmoById(id);
}

// ─── Качества оружия ──────────────────────────────────────────────────────────

export async function getWeaponQualities() {
  return catalogGetWeaponQualities();
}

export async function getQualityByName(name) {
  return catalogGetQualityByName(name);
}

// ─── Перки ────────────────────────────────────────────────────────────────────

export async function getPerks(perkName = null) {
  return catalogGetPerks(perkName);
}

// ─── Предметы ─────────────────────────────────────────────────────────────────

export async function getItems(itemType = null) {
  return catalogGetItems(itemType);
}

export async function getItemByName(name) {
  return catalogGetItemByName(name);
}

// ─── Персонажи (СОХРАНЁНКИ — остаются в SQLite) ─────────────────────────────────

const makeDuplicateCharacterId = (timestamp) => createDuplicateCharacterId(
  timestamp,
  Math.random().toString(36).slice(2, 11),
);

export async function saveCharacter(id, name, level, originName, data) {
  const now = Date.now();
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  const existing = await getFirst('SELECT id FROM characters WHERE id = ?', [id]);
  if (existing) {
    await runQuery(
      'UPDATE characters SET name = ?, level = ?, origin_name = ?, data = ?, updated_at = ? WHERE id = ?',
      [name, level, originName, dataStr, now, id]
    );
  } else {
    await runQuery(
      'INSERT INTO characters (id, name, level, origin_name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, level, originName, dataStr, now, now]
    );
  }
}

export async function loadCharacterById(id) {
  const row = await getFirst('SELECT * FROM characters WHERE id = ?', [id]);
  if (!row) return null;
  const renameRequest = await getFirst(
    'SELECT character_id FROM character_rename_requests WHERE character_id = ?',
    [id],
  );
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    renamePending: Boolean(renameRequest),
  };
}

export async function getCharactersList() {
  const rows = await getAll(
    'SELECT id, name, level, origin_name, created_at, updated_at FROM characters ORDER BY created_at DESC'
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    level: r.level,
    originName: r.origin_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Atomically duplicates a character, its folder placement, and its rename marker.
 * The domain helper owns copy semantics; persistence only stores its result.
 */
export async function duplicateCharacter(id, copySuffix) {
  const source = await getFirst('SELECT * FROM characters WHERE id = ?', [id]);
  if (!source) throw new Error(`Character not found: ${id}`);

  const existingNames = (await getAll('SELECT name FROM characters')).map(row => row.name);
  const sourceMembership = await getFirst(
    'SELECT folder_id FROM character_folder_memberships WHERE character_id = ?',
    [id],
  );
  const timestamp = Date.now();
  const duplicate = buildCharacterDuplicate({
    source: {
      id: source.id,
      name: source.name,
      level: source.level,
      originName: source.origin_name,
      data: typeof source.data === 'string' ? JSON.parse(source.data) : source.data,
    },
    existingNames,
    copyLabel: copySuffix,
    duplicateId: makeDuplicateCharacterId(timestamp),
    timestamp,
  });

  const statements = [
    {
      sql: `INSERT INTO characters
              (id, name, level, origin_name, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        duplicate.id,
        duplicate.name,
        duplicate.level,
        duplicate.originName,
        JSON.stringify(duplicate.data),
        duplicate.createdAt,
        duplicate.updatedAt,
      ],
    },
    {
      sql: 'INSERT INTO character_rename_requests (character_id) VALUES (?)',
      params: [duplicate.id],
    },
  ];

  if (sourceMembership) {
    statements.push({
      sql: `INSERT INTO character_folder_memberships (character_id, folder_id)
            VALUES (?, ?)`,
      params: [duplicate.id, sourceMembership.folder_id],
    });
  }

  await runBatch(statements);
  return duplicate;
}

export async function clearCharacterRenameRequest(id) {
  await runQuery('DELETE FROM character_rename_requests WHERE character_id = ?', [id]);
}

export async function deleteCharacter(id) {
  await runBatch([
    { sql: 'DELETE FROM character_rename_requests WHERE character_id = ?', params: [id] },
    { sql: 'DELETE FROM character_folder_memberships WHERE character_id = ?', params: [id] },
    { sql: 'DELETE FROM characters WHERE id = ?', params: [id] },
  ]);
}

// ─── Правила эффектов перков (если используются — остаются в БД) ─────────────────

export async function getPerkEffects(_perkName, _rank = 1) {
  // perk_effects больше не хранится в БД (каталог в JSON). Не используется в коде.
  return [];
}

// ─── Каталоги персонажей ────────────────────────────────────────────────────

const cleanFolderName = (name) => String(name ?? '').trim();
const makeFolderId = () => `folder_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export async function getCharacterFolders() {
  const rows = await getAll('SELECT id, name, created_at, updated_at, sort_order FROM character_folders ORDER BY sort_order ASC, created_at ASC');
  return rows.map((row) => ({
    id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, sortOrder: row.sort_order,
  }));
}

export async function createCharacterFolder(name) {
  const cleanName = cleanFolderName(name);
  if (!cleanName) throw new Error('Folder name is required');
  const now = Date.now();
  const last = await getFirst('SELECT sort_order FROM character_folders ORDER BY sort_order DESC LIMIT 1');
  const folder = { id: makeFolderId(), name: cleanName, createdAt: now, updatedAt: now, sortOrder: Number(last?.sort_order ?? -1) + 1 };
  await runQuery('INSERT INTO character_folders (id, name, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?)',
    [folder.id, folder.name, folder.createdAt, folder.updatedAt, folder.sortOrder]);
  return folder;
}

export async function renameCharacterFolder(folderId, name) {
  const cleanName = cleanFolderName(name);
  if (!cleanName) throw new Error('Folder name is required');
  await runQuery('UPDATE character_folders SET name = ?, updated_at = ? WHERE id = ?', [cleanName, Date.now(), folderId]);
}

export async function getCharacterFolderId(characterId) {
  const row = await getFirst('SELECT folder_id FROM character_folder_memberships WHERE character_id = ?', [characterId]);
  return row?.folder_id ?? null;
}

export async function moveCharacterToFolder(characterId, folderId) {
  if (folderId == null) {
    await runQuery('DELETE FROM character_folder_memberships WHERE character_id = ?', [characterId]);
    return;
  }
  const folder = await getFirst('SELECT id FROM character_folders WHERE id = ?', [folderId]);
  if (!folder) throw new Error('Folder not found');
  const existing = await getCharacterFolderId(characterId);
  if (existing) await runQuery('UPDATE character_folder_memberships SET folder_id = ? WHERE character_id = ?', [folderId, characterId]);
  else await runQuery('INSERT INTO character_folder_memberships (character_id, folder_id) VALUES (?, ?)', [characterId, folderId]);
}

export async function getRootCharactersList() {
  const rows = await getAll('SELECT id, name, level, origin_name, created_at, updated_at FROM characters ORDER BY created_at DESC');
  const memberships = await getAll('SELECT character_id FROM character_folder_memberships');
  const assigned = new Set(memberships.map((row) => row.character_id));
  return rows.filter((row) => !assigned.has(row.id)).map((row) => ({ id: row.id, name: row.name, level: row.level, originName: row.origin_name, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function getCharactersInFolder(folderId) {
  const rows = await getAll('SELECT id, name, level, origin_name, created_at, updated_at FROM characters ORDER BY created_at DESC');
  const memberships = await getAll('SELECT character_id, folder_id FROM character_folder_memberships WHERE folder_id = ?', [folderId]);
  const ids = new Set(memberships.map((row) => row.character_id));
  return rows.filter((row) => ids.has(row.id)).map((row) => ({ id: row.id, name: row.name, level: row.level, originName: row.origin_name, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function deleteCharacterFolderAndCharacters(folderId) {
  const members = await getAll('SELECT character_id FROM character_folder_memberships WHERE folder_id = ?', [folderId]);
  const statements = members.flatMap((member) => [
    { sql: 'DELETE FROM character_rename_requests WHERE character_id = ?', params: [member.character_id] },
    { sql: 'DELETE FROM character_folder_memberships WHERE character_id = ?', params: [member.character_id] },
    { sql: 'DELETE FROM characters WHERE id = ?', params: [member.character_id] },
  ]);
  statements.push(
    { sql: 'DELETE FROM character_folder_memberships WHERE folder_id = ?', params: [folderId] },
    { sql: 'DELETE FROM character_folders WHERE id = ?', params: [folderId] },
  );
  await runBatch(statements);
  return members.map((member) => member.character_id);
}
