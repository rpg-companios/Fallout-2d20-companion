// Предохранитель №11 (устав §3): каждый .ts/.tsx движка и модулей ОБЯЗАН
// входить в include tsconfig.json — «тихая» миграция мимо компилятора
// невозможна. include — храповик: только растёт (план миграции, М1).
//
// Обратное тоже проверяем: протухшая запись include (файл удалили/переименовали)
// падает тестом, а не висит мёртвым грузом.
//
// Тесты сами остаются на JS (политика тестов устава §2а) — __tests__ из
// проверки исключён. .d.ts не проверяем: декларации подключаются импортами.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.json');

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'patchs', 'сеттинги', '.kiro', '.local',
  'public', 'assets', '__tests__', '.expo',
]);
const TS_FILE_RE = /\.(ts|tsx)$/;

const collectTsFiles = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectTsFiles(full, acc);
    } else if (TS_FILE_RE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
};

const readInclude = () => {
  const raw = JSON.parse(fs.readFileSync(TSCONFIG_PATH, 'utf8'));
  const include = Array.isArray(raw?.include) ? raw.include : [];
  if (include.length === 0) throw new Error('tsconfig.json: пустой include — серия TS не начата?');
  return include;
};

const expandIncludeEntry = (entry) => {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    return (TS_FILE_RE.test(full) && !full.endsWith('.d.ts')) ? [full] : [];
  }
  return collectTsFiles(full, []);
};

describe('предохранитель: tsconfig покрывает все .ts/.tsx', () => {
  it('каждый .ts/.tsx на диске входит в include', () => {
    const onDisk = collectTsFiles(ROOT);
    expect(onDisk.length).toBeGreaterThan(0); // серия TS начата — файлов быть должно

    const covered = new Set();
    for (const entry of readInclude()) {
      for (const file of expandIncludeEntry(entry)) covered.add(file);
    }

    const uncovered = onDisk
      .filter((file) => !covered.has(file))
      .map((file) => path.relative(ROOT, file));
    expect(uncovered).toEqual([]);
  });

  it('каждая запись include существует на диске (протухших записей нет)', () => {
    const stale = readInclude().filter((entry) => !fs.existsSync(path.join(ROOT, entry)));
    expect(stale).toEqual([]);
  });
});
