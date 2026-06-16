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
  await runQuery('DELETE FROM characters WHERE id = ?', [id]);
}

export async function getPerkEffects(_perkName, _rank = 1) {
  // perk_effects больше не хранится в БД (каталог в JSON). Не используется в коде.
  return [];
}
