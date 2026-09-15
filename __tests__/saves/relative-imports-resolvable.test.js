// Предохранитель «каждый относительный импорт обязан существовать на диске»
// (после горячего фикса 249: Metro падает «Unable to resolve» на неверной
// глубине пути, а AST-тесты vitest импорты НЕ резолвят — контракт 242
// прошёл тесты и сломал бандл).
//
// Обход components/, modules/, src/, App.js, index.js: для каждого ES-импорта
// (import … from / export … from) с относительным спецификатором проверяем
// разрешение на файловой системе (с расширениями .js/.jsx/.ts/.tsx/.json и
// индексами каталогов). Ассеты (png/shrift и т.п.) пропускаются — их Metro
// раздаёт своими лоадерами.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SCAN_TARGETS = [
  path.join(ROOT, 'components'),
  path.join(ROOT, 'modules'),
  path.join(ROOT, 'src'),
  path.join(ROOT, 'App.js'),
  path.join(ROOT, 'index.js'),
];
const FILE_RE = /\.(js|jsx|ts|tsx)$/;
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ico|ttf|otf|woff2?|mp3|wav|m4a)$/i;
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"](\.[^'"]+)['"]/g;

const collectFiles = (target, acc = []) => {
  if (!fs.existsSync(target)) return acc;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (FILE_RE.test(target)) acc.push(target);
    return acc;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    collectFiles(path.join(target, entry.name), acc);
  }
  return acc;
};

const resolvable = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.json`,
    path.join(base, 'index.js'), path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};

describe('предохранитель: относительные импорты разрешаются на диске', () => {
  it('каждый относительный import/export указывает на существующий файл', () => {
    const files = SCAN_TARGETS.flatMap((target) => collectFiles(target));
    const broken = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(IMPORT_RE)) {
        const spec = match[1];
        if (ASSET_RE.test(spec)) continue;
        if (!resolvable(file, spec)) {
          broken.push(`${path.relative(ROOT, file)} → ${spec}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
