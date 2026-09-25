// ПРИЁМОЧНЫЙ (патч 379): все JS-файлы приложения обязаны парситься.
// В 367 при правке WeaponsAndArmorScreen продублировался хвост файла —
// vitest его не импортировал, Metro упал только при сборке у владельца.
// Заслон: babel-парс каждого .js (screens, логика, корень) в тесте.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const targets = [join(root, 'modules', 'fallout'), join(root)];

const walkJs = (dir, acc = [], depth = 0) => {
  if (depth > 12) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJs(p, acc, depth + 1);
    else if (name.endsWith('.js')) acc.push(p);
  }
  return acc;
};

const seen = new Set();
const files = targets
  .flatMap((t) => walkJs(t))
  .filter((f) => !seen.has(f) && seen.add(f))
  .sort();

describe('патч 379: синтаксис всех JS-файлов приложения', () => {
  it('файлы найдены (защита от пустого прогона)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    it(file.slice(root.length + 1), () => {
      expect(() =>
        parse(readFileSync(file, 'utf8'), {
          sourceType: 'module',
          plugins: ['jsx', 'flow'],
          allowReturnOutsideFunction: true,
        }),
      ).not.toThrow();
    });
  }
});
