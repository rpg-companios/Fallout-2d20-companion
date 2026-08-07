import { getAll, getFirst, runQuery, initDatabase, runBatch, tableExists } from './adapters/WebAdapter';
import {
  catalogGetWeapons, catalogGetWeaponById, catalogSearchWeapons, catalogGetWeaponByName,
  catalogGetWeaponMods, catalogGetWeaponModById, catalogGetModsForWeaponSlot, catalogGetSlotsForWeapon,
  catalogGetAmmoTypes, catalogGetAmmoById,
  catalogGetWeaponQualities, catalogGetQualityByName,
  catalogGetPerks, catalogGetItems, catalogGetItemByName, catalogRowCount,
} from './catalogSource';

export { initDatabase, runQuery, getAll, getFirst, runBatch, tableExists };

// Каталог теперь в JSON; getRowCount возвращает число записей каталога.
export async function getRowCount() {
  return catalogRowCount();
}

// ─── Каталог (из JSON) ──────────────────────────────────────────────────────

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

export async function getAmmoTypes() {
  return catalogGetAmmoTypes();
}

export async function getAmmoById(id) {
  return catalogGetAmmoById(id);
}

export async function getWeaponQualities() {
  return catalogGetWeaponQualities();
}

export async function getQualityByName(name) {
  return catalogGetQualityByName(name);
}

export async function getPerks(perkName = null) {
  return catalogGetPerks(perkName);
}

export async function getItems(itemType = null) {
  return catalogGetItems(itemType);
}

export async function getItemByName(name) {
  return catalogGetItemByName(name);
}

// ─── Персонажи (СОХРАНЁНКИ — остаются в SQLite/Web-adapter) ─────────────────────

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
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
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

export async function deleteCharacter(id) {
  await runBatch([{ sql: 'DELETE FROM character_folder_memberships WHERE character_id = ?', params: [id] }, { sql: 'DELETE FROM characters WHERE id = ?', params: [id] }]);
}

export async function getPerkEffects(_perkName, _rank = 1) {
  // perk_effects больше не хранится в БД (каталог в JSON). Не используется в коде.
  return [];
}


// ─── Каталоги персонажей ────────────────────────────────────────────────────
const cleanFolderName = (name) => String(name ?? '').trim();
const makeFolderId = () => `folder_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const characterSummary = (row) => ({ id: row.id, name: row.name, level: row.level, originName: row.origin_name, createdAt: row.created_at, updatedAt: row.updated_at });

export async function getCharacterFolders() {
  const rows = await getAll('SELECT id, name, created_at, updated_at, sort_order FROM character_folders ORDER BY sort_order ASC, created_at ASC');
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, sortOrder: row.sort_order }));
}
export async function createCharacterFolder(name) {
  const cleanName = cleanFolderName(name);
  if (!cleanName) throw new Error('Folder name is required');
  const now = Date.now();
  const last = await getFirst('SELECT sort_order FROM character_folders ORDER BY sort_order DESC LIMIT 1');
  const folder = { id: makeFolderId(), name: cleanName, createdAt: now, updatedAt: now, sortOrder: Number(last?.sort_order ?? -1) + 1 };
  await runQuery('INSERT INTO character_folders (id, name, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?)', [folder.id, folder.name, now, now, folder.sortOrder]);
  return folder;
}
export async function renameCharacterFolder(folderId, name) {
  const cleanName = cleanFolderName(name);
  if (!cleanName) throw new Error('Folder name is required');
  await runQuery('UPDATE character_folders SET name = ?, updated_at = ? WHERE id = ?', [cleanName, Date.now(), folderId]);
}
export async function getCharacterFolderId(characterId) {
  return (await getFirst('SELECT folder_id FROM character_folder_memberships WHERE character_id = ?', [characterId]))?.folder_id ?? null;
}
export async function moveCharacterToFolder(characterId, folderId) {
  if (folderId == null) return runQuery('DELETE FROM character_folder_memberships WHERE character_id = ?', [characterId]);
  if (!(await getFirst('SELECT id FROM character_folders WHERE id = ?', [folderId]))) throw new Error('Folder not found');
  if (await getCharacterFolderId(characterId)) await runQuery('UPDATE character_folder_memberships SET folder_id = ? WHERE character_id = ?', [folderId, characterId]);
  else await runQuery('INSERT INTO character_folder_memberships (character_id, folder_id) VALUES (?, ?)', [characterId, folderId]);
}
export async function getRootCharactersList() {
  const [characters, memberships] = await Promise.all([getAll('SELECT id, name, level, origin_name, created_at, updated_at FROM characters ORDER BY created_at DESC'), getAll('SELECT character_id FROM character_folder_memberships')]);
  const assigned = new Set(memberships.map((row) => row.character_id));
  return characters.filter((row) => !assigned.has(row.id)).map(characterSummary);
}
export async function getCharactersInFolder(folderId) {
  const [characters, memberships] = await Promise.all([getAll('SELECT id, name, level, origin_name, created_at, updated_at FROM characters ORDER BY created_at DESC'), getAll('SELECT character_id FROM character_folder_memberships WHERE folder_id = ?', [folderId])]);
  const ids = new Set(memberships.map((row) => row.character_id));
  return characters.filter((row) => ids.has(row.id)).map(characterSummary);
}
export async function deleteCharacterFolderAndCharacters(folderId) {
  const members = await getAll('SELECT character_id FROM character_folder_memberships WHERE folder_id = ?', [folderId]);
  await runBatch([...members.flatMap(({ character_id }) => [{ sql: 'DELETE FROM character_folder_memberships WHERE character_id = ?', params: [character_id] }, { sql: 'DELETE FROM characters WHERE id = ?', params: [character_id] }]), { sql: 'DELETE FROM character_folder_memberships WHERE folder_id = ?', params: [folderId] }, { sql: 'DELETE FROM character_folders WHERE id = ?', params: [folderId] }]);
  return members.map((row) => row.character_id);
}
