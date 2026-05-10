import { Platform } from 'react-native';

let adapter;

if (Platform.OS === 'web') {
  adapter = require('./adapters/WebAdapter');
} else {
  adapter = require('./adapters/SQLiteAdapter');
}

export const { initDatabase, runQuery, getAll, getFirst, runBatch, tableExists, getRowCount } = adapter;

// ─── Оружие ───────────────────────────────────────────────────────────────────

export async function getWeapons(weaponType = null) {
  if (weaponType) {
    return getAll('SELECT * FROM weapons WHERE weapon_type = ?', [weaponType]);
  }
  return getAll('SELECT * FROM weapons ORDER BY weapon_type, name');
}

export async function getWeaponById(id) {
  return getFirst('SELECT * FROM weapons WHERE id = ?', [id]);
}

export async function searchWeapons(query) {
  return getAll('SELECT * FROM weapons WHERE name LIKE ?', [`%${query}%`]);
}

export async function getWeaponByName(name) {
  return getFirst('SELECT * FROM weapons WHERE name = ?', [name]);
}

// ─── Модификации оружия ────────────────────────────────────────────────────────

export async function getWeaponMods(weaponId = null) {
  if (weaponId) {
    return getAll('SELECT * FROM weapon_mods WHERE applies_to_ids LIKE ?', [`%${weaponId}%`]);
  }
  return getAll('SELECT * FROM weapon_mods ORDER BY slot, name');
}

export async function getWeaponModById(id) {
  return getFirst('SELECT * FROM weapon_mods WHERE id = ?', [id]);
}

export async function getModsForWeaponSlot(weaponId, slot) {
  const rows = await getAll(
    'SELECT mod_id FROM weapon_mod_slots WHERE weapon_id = ? AND slot = ?',
    [weaponId, slot]
  );
  if (!rows.length) return [];
  const ids = rows.map(r => r.mod_id);
  const result = [];
  for (const id of ids) {
    const mod = await getFirst('SELECT * FROM weapon_mods WHERE id = ?', [id]);
    if (mod) result.push(mod);
  }
  return result;
}

export async function getSlotsForWeapon(weaponId) {
  const rows = await getAll(
    'SELECT DISTINCT slot FROM weapon_mod_slots WHERE weapon_id = ?',
    [weaponId]
  );
  return rows.map(r => r.slot);
}

// ─── Патроны ──────────────────────────────────────────────────────────────────

export async function getAmmoTypes() {
  return getAll('SELECT * FROM ammo_types ORDER BY name');
}

export async function getAmmoById(id) {
  return getFirst('SELECT * FROM ammo_types WHERE id = ?', [id]);
}

// ─── Качества оружия ──────────────────────────────────────────────────────────

export async function getWeaponQualities() {
  return getAll('SELECT * FROM weapon_qualities ORDER BY name');
}

export async function getQualityByName(name) {
  return getFirst('SELECT * FROM weapon_qualities WHERE name = ?', [name]);
}

// ─── Перки ────────────────────────────────────────────────────────────────────

export async function getPerks(perkName = null) {
  if (perkName) {
    return getAll('SELECT * FROM perks WHERE perk_name = ? ORDER BY rank', [perkName]);
  }
  return getAll('SELECT * FROM perks ORDER BY perk_name, rank');
}

// ─── Предметы ─────────────────────────────────────────────────────────────────

export async function getItems(itemType = null) {
  if (itemType) {
    return getAll('SELECT * FROM items WHERE item_type = ?', [itemType]);
  }
  return getAll('SELECT * FROM items ORDER BY item_type, name');
}

export async function getItemByName(name) {
  return getFirst('SELECT * FROM items WHERE name = ?', [name]);
}

// ─── Персонажи ────────────────────────────────────────────────────────────────

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

// ─── Правила эффектов ─────────────────────────────────────────────────────────

export async function getPerkEffects(perkName, rank = 1) {
  return getAll(
    'SELECT * FROM perk_effects WHERE perk_name = ? AND perk_rank = ?',
    [perkName, rank]
  );
}
