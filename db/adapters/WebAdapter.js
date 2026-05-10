import AsyncStorage from '@react-native-async-storage/async-storage';
import { SCHEMA_VERSION } from '../schema';

const PREFIX = 'fallout_db_';

async function readTable(tableName) {
  const raw = await AsyncStorage.getItem(PREFIX + tableName);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeTable(tableName, rows) {
  await AsyncStorage.setItem(PREFIX + tableName, JSON.stringify(rows));
}

async function readMeta() {
  const raw = await AsyncStorage.getItem(PREFIX + 'schema_meta');
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    const obj = {};
    parsed.forEach(r => { if (r.key) obj[r.key] = r.value; });
    return obj;
  }
  return parsed;
}

async function writeMeta(meta) {
  const rows = Object.entries(meta).map(([key, value]) => ({ key, value }));
  await AsyncStorage.setItem(PREFIX + 'schema_meta', JSON.stringify(rows));
}

function matchesWhere(row, whereClause, params) {
  if (!whereClause) return true;
  let idx = 0;
  const clause = whereClause.replace(/\?/g, () => {
    const val = params[idx++];
    return typeof val === 'string' ? `'${val}'` : val;
  });
  try {
    const parts = clause.split(/\s+AND\s+/i);
    return parts.every(part => {
      const m = part.trim().match(/^(\w+)\s*(=|!=|<|>|<=|>=|LIKE)\s*'?([^']*)'?$/i);
      if (!m) return true;
      const [, field, op, val] = m;
      const rowVal = String(row[field] ?? '');
      switch (op.toUpperCase()) {
        case '=': return rowVal === val;
        case '!=': return rowVal !== val;
        case '<': return Number(rowVal) < Number(val);
        case '>': return Number(rowVal) > Number(val);
        case '<=': return Number(rowVal) <= Number(val);
        case '>=': return Number(rowVal) >= Number(val);
        case 'LIKE': return rowVal.toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
        default: return true;
      }
    });
  } catch {
    return true;
  }
}

function parseInsert(sql) {
  const m = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!m) return null;
  const table = m[1];
  const cols = m[2].split(',').map(c => c.trim());
  return { table, cols };
}

function parseUpdate(sql) {
  const m = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
  if (!m) return null;
  const table = m[1];
  const setCols = m[2].split(',').map(s => s.trim().split('=')[0].trim());
  const where = m[3].trim();
  return { table, setCols, where };
}

function parseDelete(sql) {
  const m = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
  if (!m) return null;
  return { table: m[1], where: m[2] };
}

function parseSelect(sql) {
  const m = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) return null;
  return { cols: m[1], table: m[2], where: m[3], orderBy: m[4], limit: m[5] };
}

const DATA_TABLES = [
  'weapons', 'weapon_mods', 'weapon_mod_slots', 'ammo_types',
  'weapon_qualities', 'perks', 'items', 'perk_effects',
];

export async function initDatabase() {
  const meta = await readMeta();
  const storedVersion = meta.seeded_version ? Number(meta.seeded_version) : (meta.version ? Number(meta.version) : 0);

  if (storedVersion !== SCHEMA_VERSION) {
    for (const t of DATA_TABLES) {
      await AsyncStorage.removeItem(PREFIX + t);
    }
    await writeMeta({ version: String(SCHEMA_VERSION), seeded_version: String(SCHEMA_VERSION) });
    return true;
  }
  return false;
}

export async function runQuery(sql, params = []) {
  const trimmed = sql.trim().toUpperCase();

  if (trimmed.startsWith('INSERT')) {
    const parsed = parseInsert(sql);
    if (!parsed) return;
    const rows = await readTable(parsed.table);
    const obj = {};
    parsed.cols.forEach((col, i) => { obj[col] = params[i] ?? null; });
    const isReplace = /INSERT\s+OR\s+REPLACE/i.test(sql);
    const pkField = parsed.cols[0];
    if (isReplace) {
      const idx = rows.findIndex(r => r[pkField] === obj[pkField]);
      if (idx >= 0) rows[idx] = obj;
      else rows.push(obj);
    } else {
      rows.push(obj);
    }
    await writeTable(parsed.table, rows);
    return;
  }

  if (trimmed.startsWith('UPDATE')) {
    const parsed = parseUpdate(sql);
    if (!parsed) return;
    const rows = await readTable(parsed.table);
    let pIdx = 0;
    const setParams = params.slice(0, parsed.setCols.length);
    const whereParams = params.slice(parsed.setCols.length);
    const updated = rows.map(row => {
      if (!matchesWhere(row, parsed.where, whereParams)) return row;
      const newRow = { ...row };
      parsed.setCols.forEach((col, i) => { newRow[col] = setParams[i]; });
      return newRow;
    });
    await writeTable(parsed.table, updated);
    return;
  }

  if (trimmed.startsWith('DELETE')) {
    const parsed = parseDelete(sql);
    if (!parsed) return;
    const rows = await readTable(parsed.table);
    const filtered = parsed.where
      ? rows.filter(r => !matchesWhere(r, parsed.where, params))
      : [];
    await writeTable(parsed.table, filtered);
    return;
  }
}

export async function getAll(sql, params = []) {
  const parsed = parseSelect(sql);
  if (!parsed) return [];
  let rows = await readTable(parsed.table);
  if (parsed.where) {
    rows = rows.filter(r => matchesWhere(r, parsed.where, params));
  }
  if (parsed.orderBy) {
    const [field, dir] = parsed.orderBy.trim().split(/\s+/);
    rows.sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return dir?.toUpperCase() === 'DESC' ? -cmp : cmp;
    });
  }
  if (parsed.limit) rows = rows.slice(0, parseInt(parsed.limit));
  return rows;
}

export async function getFirst(sql, params = []) {
  const rows = await getAll(sql, params);
  return rows[0] || null;
}

export async function runBatch(statements) {
  const grouped = {};
  for (const { sql, params } of statements) {
    const parsed = parseInsert(sql);
    if (parsed) {
      if (!grouped[parsed.table]) grouped[parsed.table] = { table: parsed.table, cols: parsed.cols, rows: [] };
      grouped[parsed.table].rows.push(params);
    } else {
      await runQuery(sql, params);
    }
  }
  for (const [table, data] of Object.entries(grouped)) {
    const existing = await readTable(table);
    const pkField = data.cols[0];
    const isReplace = statements.find(s => /INSERT\s+OR\s+REPLACE/i.test(s.sql));
    const map = new Map(existing.map(r => [r[pkField], r]));
    for (const params of data.rows) {
      const obj = {};
      data.cols.forEach((col, i) => { obj[col] = params[i] ?? null; });
      map.set(obj[pkField], obj);
    }
    await writeTable(table, Array.from(map.values()));
  }
}

export async function tableExists(tableName) {
  const raw = await AsyncStorage.getItem(PREFIX + tableName);
  return raw !== null;
}

export async function getRowCount(tableName) {
  const rows = await readTable(tableName);
  return rows.length;
}
