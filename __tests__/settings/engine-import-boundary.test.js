import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENGINE_ROOT = join(ROOT, 'src/engine');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function collectSources(directory, files = []) {
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      collectSources(absolute, files);
    } else if (SOURCE_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      files.push(absolute);
    }
  }
  return files;
}

function importSpecifiers(source) {
  const pattern = /\bimport\s*(?:[^'"\n]*?\sfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3]);
}

describe('engine setting-package boundary', () => {
  it('engine contracts and primitives do not import setting modules', () => {
    const violations = [];
    for (const absolute of collectSources(ENGINE_ROOT)) {
      const source = readFileSync(absolute, 'utf8');
      const forbidden = importSpecifiers(source)
        .filter((specifier) => /(?:^|\/)modules\//.test(specifier));
      for (const specifier of forbidden) {
        violations.push(`${relative(ROOT, absolute)} -> ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
