#!/usr/bin/env node
/**
 * build-scrap-data.mjs — генератор данных разбора (этап «данные» большого шага).
 *
 * Источник истины: scripts/scrap-source.json — таблицы разбора, переданные
 * владельцем 2026-09-16 (raw-02/raw-03 в приёмнике). Генератор:
 *   - materials.json: три пачковых материала (неизменны) + именованные материалы
 *     из salvage-списка книги; для crystal/gold/coal/iron числа по правилу
 *     редкости (1/3/5 крышки, вес 1), остальным — печатные (вес = табличный на 10 / 10);
 *   - junk.json: каталог хлама (~все предметы из девяти таблиц) + руды;
 *     legacy-предметы (желёза блоатфлая, жало стингвинга) сохраняются как есть;
 *   - scrap/salvage.json: состав разбора по id предмета (фикс, DC-кости, эффект,
 *     альтернативы «или»);
 *   - scrap/tables.json: d20 категорий, девять таблиц граней, таблица добычи;
 *   - i18n-зеркала ru/en для junk и materials.
 *
 * Запуск: node scripts/build-scrap-data.mjs          — сгенерировать
 *         node scripts/build-scrap-data.mjs --check  — сверить с дискoм (CI/тест)
 * Любое расхождение в источнике (неизвестный материал, дыра в гранях, дубль id) —
 * падение, молча ничего не чиним.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = JSON.parse(fs.readFileSync(path.join(HERE, 'scrap-source.json'), 'utf8'));

const DATA = path.join(ROOT, 'modules/fallout/data');
const I18N = path.join(ROOT, 'modules/fallout/i18n');
const CHECK = process.argv.includes('--check');

const j = (x) => JSON.stringify(x, null, 2) + '\n';
const errors = [];
const fail = (msg) => errors.push(msg);

// страж: новые id не должны сталкиваться с предметами основного каталога
const catalogIdScan = (dir) => {
  const acc = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (typeof node.id === 'string') acc.add(node.id);
      Object.values(node).forEach(walk);
    }
  };
  const scan = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'scrap') scan(f); continue; }
      if (!e.name.endsWith('.json')) continue;
      if (['junk.json', 'materials.json'].includes(e.name) && d.endsWith(`${path.sep}data`)) continue;
      try { walk(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch {}
    }
  };
  scan(dir);
  return acc;
};
const CATALOG_IDS = catalogIdScan(DATA);
const assertFreshId = (id) => { if (CATALOG_IDS.has(id)) fail(`id ${id} уже занят предметом основного каталога — линкуй, не дублируй`); };

// ─── материалы ────────────────────────────────────────────────────────────────
const PACKS = [
  { id: 'item_common_materials', itemType: 'misc', weight: 1, cost: 1, rarity: 0 },
  { id: 'item_uncommon_materials', itemType: 'misc', weight: 1, cost: 3, rarity: 1 },
  { id: 'item_rare_materials', itemType: 'misc', weight: 1, cost: 5, rarity: 2 },
];

const round1 = (x) => Math.round(x * 10) / 10;
const matById = new Map();
for (const m of SRC.materials) {
  const id = m.key; // id = имя предмета; хламовость/материальность знает только реестр
  if (matById.has(id)) fail(`материал-дубль id ${id}`);
  const weight = m.byRule ? m.weight : round1(m.weight10 / 10);
  matById.set(id, { id, key: m.key, ru: m.ru, en: m.en, byRule: !!m.byRule });
  matById.get(id).entry = {
    id,
    itemType: 'misc',
    weight,
    cost: m.cost,
    rarity: m.rarity,
    namedMaterial: true,
  };
}
for (const id of matById.keys()) assertFreshId(id);
const resolveMat = (m) => {
  const id = m; // id = слаг имени: без mat_/junk_
  if (!matById.has(id)) fail(`неизвестный материал в источнике: ${m}`);
  return id;
};

// ─── хлам ─────────────────────────────────────────────────────────────────────
const junk = new Map(); // id -> entry
const salvage = {}; // itemId -> { options: [[comp]] }
const addJunk = (id, weight, cost) => {
  if (junk.has(id)) fail(`дубль хлам-id ${id}`);
  assertFreshId(id);
  junk.set(id, { id, itemType: 'junk', weight: weight === '<1' ? SRC.weightLessThan1 : weight, cost });
};

const normComp = (c) => {
  const out = { material: resolveMat(c.m) };
  if (c.count != null) out.count = c.count;
  if (c.base != null) out.base = c.base;
  if (c.dc != null) out.dc = c.dc;
  if (!(out.count != null) && !(out.dc != null)) fail(`компонента без количества/костей: ${JSON.stringify(c)}`);
  if (c.effect) {
    if (c.effect.options) {
      out.effect = { options: c.effect.options.map(normComp) };
    } else {
      out.effect = { material: resolveMat(c.effect.m), count: c.effect.count ?? 1 };
      if (c.effect.anyOnce) out.effect.anyOnce = true;
    }
  }
  return out;
};
const addSalvage = (id, salv, salvOptions) => {
  if (salvage[id]) fail(`двойной salvage для ${id}`);
  // salv — одна альтернатива (плоский список компонент) либо список альтернатив;
  // salvOptions — всегда список альтернатив («или»).
  const raw = salv ? (Array.isArray(salv[0]) ? salv : [salv]) : (salvOptions || []);
  const opts = raw.map((alt) => alt.map(normComp));
  if (!opts.length) fail(`пустой salvage для ${id}`);
  for (const opt of opts) for (const comp of opt) {
    // DC-кость может дать 0 единиц — это легально; но и count, и dc вместе — «base+dc»
    if (comp.dc != null && comp.count != null) fail(`компонента с count и dc разом: ${id}`);
  }
  salvage[id] = { options: opts };
};

// ─── обход таблиц ─────────────────────────────────────────────────────────────
const tablesOut = {};
for (const [tKey, t] of Object.entries(SRC.tables)) {
  const faces = {};
  for (const row of t.faces) {
    const [a, b] = row.f.includes('-') ? row.f.split('-').map(Number) : [Number(row.f), Number(row.f)];
    let ref;
    if (row.action) {
      ref = row.action === 'reroll' ? { action: 'reroll', table: row.to } : { action: row.action };
    } else if (row.link) {
      ref = { item: row.link };
      if (row.salv || row.salvOptions) addSalvage(row.link, row.salv, row.salvOptions);
    } else {
      const it = row.item;
      const id = it.id || it.key; // id = слаг имени предмета
      addJunk(id, it.w, it.c);
      if (it.salv || it.salvOptions) addSalvage(id, it.salv, it.salvOptions);
      ref = { item: id };
    }
    for (let f = a; f <= b; f++) {
      if (faces[f]) fail(`грань ${f} таблицы ${tKey} описана дважды`);
      faces[f] = ref;
    }
  }
  // полнота 1..20
  for (let f = 1; f <= 20; f++) if (!faces[f]) fail(`таблица ${tKey}: грань ${f} не описана`);
  tablesOut[tKey] = { ru: t.ru, en: t.en, faces };
}

// руды
const QTY_RE = /^\d+(\+\d+<cd>)?$/;
const miningFaces = {};
for (const row of SRC.mining.faces) {
  const [a, b] = row.f.includes('-') ? row.f.split('-').map(Number) : [Number(row.f), Number(row.f)];
  const ore = row.ore;
  if (!QTY_RE.test(ore.qty)) fail(`рудная формула количества не разбрана парсером кубиков: ${ore.qty}`);
  let ref;
  if (ore.directMaterial) {
    // «нашёл = материал»: уголь и кристалл — сами и есть материал
    ref = { material: resolveMat(ore.directMaterial) };
  } else {
    const id = ore.key;
    addJunk(id, 1, SRC.rarityCostByRule[String(ore.rarity)]);
    addSalvage(id, ore.salv);
    ref = { item: id };
  }
  for (let f = a; f <= b; f++) {
    if (miningFaces[f]) fail(`mining: грань ${f} дважды`);
    miningFaces[f] = { ...ref, qty: ore.qty };
  }
}
for (let f = 1; f <= 20; f++) if (!miningFaces[f]) fail(`mining: грань ${f} не описана`);

// категории (raw-01)
const catFaces = {};
for (const row of SRC.categories.d20) {
  const [a, b] = row.f.includes('-') ? row.f.split('-').map(Number) : [Number(row.f), Number(row.f)];
  if (!tablesOut[row.table]) fail(`категория ссылается на неизвестную таблицу ${row.table}`);
  for (let f = a; f <= b; f++) {
    if (catFaces[f]) fail(`категории: грань ${f} дважды`);
    catFaces[f] = { table: row.table };
  }
}
for (let f = 1; f <= 20; f++) if (!catFaces[f]) fail(`категории: грань ${f} не описана`);

// legacy-хлам (из текущего junk.json — не в книжных таблицах)
const OLD_JUNK_PATH = path.join(DATA, 'junk.json');
const oldJunk = fs.existsSync(OLD_JUNK_PATH) ? JSON.parse(fs.readFileSync(OLD_JUNK_PATH, 'utf8')) : [];
for (const legacy of SRC.legacyJunk) {
  const entry = oldJunk.find((x) => x.id === legacy.id || x.id === legacy.oldId || x.id === `junk_${legacy.id}`);
  if (!entry) fail(`legacy-предмет не найден в текущем junk.json: ${legacy.id}`);
  else if (!junk.has(legacy.id)) junk.set(legacy.id, { ...entry, id: legacy.id });
}

// сохранение существующих имён i18n для id, которые уже были в зеркалах
const readI18n = (loc, file) => {
  const p = path.join(I18N, loc, 'data', file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
};
const names = { 'ru-RU': new Map(), 'en-EN': new Map() };
for (const loc of Object.keys(names)) {
  for (const srcFile of ['junk.json', 'materials.json']) {
    for (const it of readI18n(loc, srcFile)) {
    if (!it?.id) continue;
    if (!names[loc].has(it.id)) names[loc].set(it.id, it);
    const bare = it.id.replace(/^junk_/, ''); // старые junk_-id отдают имена новым bare-id
    if (!names[loc].has(bare)) names[loc].set(bare, it);
  }
  }
}

const junkList = [...junk.values()];
const materialsList = [...PACKS, ...[...matById.values()].map((m) => m.entry)];
const junkI18n = {};
const matI18n = {};
for (const [loc, lang] of [['ru-RU', 'ru'], ['en-EN', 'en']]) {
  junkI18n[loc] = junkList.map((it) => {
    const keep = names[loc].get(it.id);
    const fromSource = Object.values(SRC.tables).flatMap((t) => t.faces).map((r) => r.item).filter(Boolean)
      .find((x) => (x.id || x.key) === it.id);
    const mining = SRC.mining.faces.map((r) => r.ore).find((o) => o.key === it.id);
    const name = keep?.name || (loc === 'ru-RU' ? fromSource?.ru || mining?.ru : fromSource?.en || mining?.en);
    if (!name) fail(`нет имени ${loc} для ${it.id}`);
    return { id: it.id, name };
  });
  matI18n[loc] = materialsList.map((m) => {
    const meta = [...matById.values()].find((x) => x.entry === m);
    const keep = names[loc].get(m.id);
    if (!meta && !keep?.name) fail(`нет имени ${loc} для материала ${m.id}`);
    return {
      id: m.id,
      name: keep?.name || (loc === 'ru-RU' ? meta.ru : meta.en),
      effectLabel: keep?.effectLabel ?? '',
      description: keep?.description ?? '',
    };
  });
}

// ─── вывод ─────────────────────────────────────────────────────────────────────
const outputs = new Map();
const put = (p, content) => outputs.set(path.join(ROOT, p), content);

put('modules/fallout/data/materials.json', j(materialsList));
put('modules/fallout/data/junk.json', j(junkList));
put('modules/fallout/data/scrap/salvage.json', j(salvage));
put('modules/fallout/data/scrap/tables.json', j({
  categories: { ru: SRC.categories.ru, en: SRC.categories.en, faces: catFaces },
  tables: tablesOut,
  mining: { ru: SRC.mining.ru, en: SRC.mining.en, faces: miningFaces },
}));
put('modules/fallout/i18n/ru-RU/data/junk.json', j(junkI18n['ru-RU']));
put('modules/fallout/i18n/en-EN/data/junk.json', j(junkI18n['en-EN']));
put('modules/fallout/i18n/ru-RU/data/materials.json', j([...matI18n['ru-RU']]));
put('modules/fallout/i18n/en-EN/data/materials.json', j([...matI18n['en-EN']]));

if (errors.length) {
  console.error('Ошибки источника:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}

if (CHECK) {
  let bad = 0;
  for (const [p, content] of outputs) {
    const onDisk = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (onDisk !== content) {
      console.error(`--check: расходится: ${path.relative(ROOT, p)}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`--check OK: ${outputs.size} файлов соответствуют источнику`);
} else {
  for (const [p, content] of outputs) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  console.log(`Записано файлов: ${outputs.size}; хлам: ${junkList.length}; материалы: ${materialsList.length}; salvage-записей: ${Object.keys(salvage).length}`);
}
