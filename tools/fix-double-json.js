#!/usr/bin/env node
/**
 * Починка файлов данных со склейкой «два JSON подряд».
 *
 * Симптом (слово владельца — «белые экраны», сборщик падает):
 *   БИТЫЙ: ... — Unexpected non-whitespace character after JSON at position N
 * Причина: при вставке данных новое содержимое приклеилось в конец файла
 * вместо замены — в файле несколько JSON-документов подряд.
 *
 * Что делает:
 *   — находит все файлы .json в modules/ со склейкой;
 *   — показывает, что склеилось (сколько записей в каждом куске,
 *     первая и последняя запись каждого куска);
 *   — сохраняет резервную копию <файл>.bak;
 *   — сливает куски: записи с одинаковым id — побеждает ПОСЛЕДНИЙ кусок
 *     (более поздняя вставка), записи без дублей — остаются все;
 *   — файлы без склейки не трогает, куски, которые не разбираются,
 *     не трогает (человек посмотрит руками).
 *
 * Запуск:  node tools/fix-double-json.js
 * Откат:   mv <файл>.bak <файл>
 */
const fs = require('fs');
const path = require('path');

const ROOTS = ['modules'];

/** Разбить текст на последовательные JSON-документы. */
function splitDocs(text) {
  const docs = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;
    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (; i < n; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end === -1) return { docs, rest: text.slice(start) };
    docs.push(text.slice(start, end));
    i = end;
  }
  return { docs, rest: '' };
}

/** Краткое описание значения для отчёта. */
function describe(doc) {
  if (Array.isArray(doc)) {
    const first = doc[0];
    const last = doc[doc.length - 1];
    const fid = first && typeof first === 'object' && 'id' in first ? first.id : JSON.stringify(first).slice(0, 40);
    const lid = last && typeof last === 'object' && 'id' in last ? last.id : JSON.stringify(last).slice(0, 40);
    return `массив из ${doc.length} записей [${fid} … ${lid}]`;
  }
  const keys = Object.keys(doc);
  return `объект из ${keys.length} ключей [${keys[0]} … ${keys[keys.length - 1]}]`;
}

/** Слияние кусков: позже — важнее. */
function mergeDocs(docs) {
  const allArrays = docs.every((d) => Array.isArray(d));
  const allObjects = docs.every((d) => !Array.isArray(d) && d && typeof d === 'object');
  if (allArrays) {
    const out = [];
    const byId = new Map();
    let dupes = 0;
    let appended = 0;
    for (const doc of docs) {
      for (const entry of doc) {
        const key = entry && typeof entry === 'object' && 'id' in entry ? `id:${entry.id}` : `raw:${JSON.stringify(entry)}`;
        if (byId.has(key)) dupes++;
        else appended++;
        byId.set(key, entry);
      }
    }
    for (const entry of byId.values()) out.push(entry);
    return { value: out, dupes, appended };
  }
  if (allObjects) {
    const out = {};
    let dupes = 0;
    let appended = 0;
    for (const doc of docs) {
      for (const [k, v] of Object.entries(doc)) {
        if (k in out) dupes++;
        else appended++;
        out[k] = v;
      }
    }
    return { value: out, dupes, appended };
  }
  return null;
}

function walk(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, files);
    else if (p.endsWith('.json')) files.push(p);
  }
}

function main() {
  const roots = process.argv.slice(2).length ? process.argv.slice(2) : ROOTS;
  const files = [];
  for (const root of roots) walk(root, files);
  let broken = 0;
  let fixed = 0;
  let skipped = 0;
  for (const p of files) {
    const text = fs.readFileSync(p, 'utf8');
    const { docs, rest } = splitDocs(text);
    if (docs.length <= 1 && !rest) continue;
    broken++;
    console.log(`\n${p}:`);
    docs.forEach((d, idx) => {
      let desc;
      try {
        desc = describe(JSON.parse(d));
      } catch (e) {
        desc = `НЕ РАЗБИРАЕТСЯ (${e.message.slice(0, 60)})`;
      }
      console.log(`  кусок ${idx + 1}: ${d.length} символов — ${desc}`);
    });
    if (rest.trim()) {
      console.log(`  хвост ${rest.trim().length} символов — НЕ РАЗБИРАЕТСЯ, начинается с: ${JSON.stringify(rest.trim().slice(0, 60))}`);
      console.log('  → НЕ ТРОГАЮ: посмотри руками (или пришли мне файл)');
      skipped++;
      continue;
    }
    const parsed = docs.map((d) => JSON.parse(d));
    const merge = mergeDocs(parsed);
    if (!merge) {
      console.log('  → НЕ ТРОГАЮ: куски разного вида (массив и объект вперемешку)');
      skipped++;
      continue;
    }
    const bak = `${p}.bak`;
    fs.writeFileSync(bak, text);
    fs.writeFileSync(p, JSON.stringify(merge.value, null, 2) + '\n');
    console.log(`  → ПОЧИНЕНО слиянием: дублей снято ${merge.dupes}, записей стало ${Array.isArray(merge.value) ? merge.value.length : Object.keys(merge.value).length}`);
    console.log(`     резервная копия: ${bak}`);
    fixed++;
  }
  console.log(`\nИтог: склеек найдено ${broken}, починено ${fixed}, потребовали рук ${skipped}.`);
  console.log('Если что-то потребовало рук — пришли файл целиком, поправлю.');
}

main();
