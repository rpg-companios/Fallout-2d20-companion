import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES, SCHEMA_VERSION } from '../schema';

let _db = null;

async function getDb() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('fallout_rpg.db');
  return _db;
}

const DATA_TABLES = [
  'weapons', 'weapon_mods', 'weapon_mod_slots', 'ammo_types',
  'weapon_qualities', 'perks', 'items', 'perk_effects',
];

export async function initDatabase() {
  const db = await getDb();
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  const row = await db.getFirstAsync(
    "SELECT value FROM schema_meta WHERE key = 'version'"
  );
  const storedVersion = row ? Number(row.value) : 0;

  if (storedVersion !== SCHEMA_VERSION) {
    for (const t of DATA_TABLES) {
      await db.execAsync(`DROP TABLE IF EXISTS ${t}`);
    }
    for (const sql of CREATE_TABLES) {
      await db.execAsync(sql);
    }
    if (row) {
      await db.runAsync("UPDATE schema_meta SET value = ? WHERE key = 'version'", [String(SCHEMA_VERSION)]);
    } else {
      await db.runAsync("INSERT INTO schema_meta (key, value) VALUES ('version', ?)", [String(SCHEMA_VERSION)]);
    }
    return true;
  }

  for (const sql of CREATE_TABLES) {
    await db.execAsync(sql);
  }
  return false;
}

export async function runQuery(sql, params = []) {
  const db = await getDb();
  return await db.runAsync(sql, params);
}

export async function getAll(sql, params = []) {
  const db = await getDb();
  return await db.getAllAsync(sql, params);
}

export async function getFirst(sql, params = []) {
  const db = await getDb();
  return await db.getFirstAsync(sql, params);
}

export async function runBatch(statements) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const { sql, params } of statements) {
      await db.runAsync(sql, params || []);
    }
  });
}

export async function tableExists(tableName) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [tableName]
  );
  return !!row;
}

export async function getRowCount(tableName) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  return row ? row.cnt : 0;
}
