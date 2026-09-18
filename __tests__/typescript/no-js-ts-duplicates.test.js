// Предохранитель №12 (устав §3): в одной папке нет дублей вида foo.js + foo.ts
// (или foo.js + foo.tsx, foo.jsx + foo.tsx, foo.ts + foo.tsx).
//
// Зачем: резолвер Metro подбирает расширения в порядке js, jsx, json, ts, tsx —
// при дубле всегда выигрывает .js, и TS-файл оказывается мёртвым: компилятор его
// проверяет, а программа исполняет другой файл. Это худший вид «тихой» миграции.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'patchs', 'сеттинги', '.kiro', '.local', '.expo']);
// Пары «маскирующих» друг друга расширений: левый выигрывает у правого при дубле.
const CONFLICTING_PAIRS = [
  ['.js', '.ts'],
  ['.js', '.tsx'],
  ['.jsx', '.ts'],
  ['.jsx', '.tsx'],
  ['.ts', '.tsx'],
];

const collectDuplicates = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectDuplicates(path.join(dir, entry.name), acc);
      continue;
    }
  }
  const byBasename = new Map();
  for (const file of fs.readdirSync(dir)) {
    const ext = path.extname(file);
    if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) continue;
    const base = file.slice(0, -ext.length);
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(ext);
  }
  for (const [base, exts] of byBasename) {
    for (const [winner, dead] of CONFLICTING_PAIRS) {
      if (exts.includes(winner) && exts.includes(dead)) {
        acc.push(`${path.relative(ROOT, dir)}/${base}: ${winner} перекрывает ${dead}`);
      }
    }
  }
  return acc;
};

describe('предохранитель: дублей .js/.ts нет', () => {
  it('ни в одной папке .js-файл не маскирует .ts/.tsx', () => {
    const duplicates = collectDuplicates(ROOT);
    expect(duplicates).toEqual([]);
  });
});
