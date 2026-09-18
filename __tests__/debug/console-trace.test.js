// Предохранитель трассировки: в рантайм-коде НЕТ плоских console.*.
//
// Правило (docs/debug-tracing.md): всё логирование идёт через один гейт
// src/debug/falloutDebug.js — по умолчанию выключен (ноль шума и аллокаций
// в проде), включается вручную из консоли браузера. Восстановлен патчем 278
// после того, как тест потерялся, а ссылки на него остались в коде и доке.
//
// Обход components/, modules/, src/, domain/, db/, i18n/, styles/,
// App.js, index.js. Разрешённое место ровно одно — сам гейт
// (его вызов g.console?.log?.(...) в правило не попадает).
// Комментарии в коде игнорируются грубо (строки с //) — как и в остальных
// предохранителях, защита от опечатки, а не от злонамеренности.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SCAN_TARGETS = [
  path.join(ROOT, 'components'),
  path.join(ROOT, 'modules'),
  path.join(ROOT, 'src'),
  path.join(ROOT, 'domain'),
  path.join(ROOT, 'db'),
  path.join(ROOT, 'i18n'),
  path.join(ROOT, 'styles'),
  path.join(ROOT, 'App.js'),
  path.join(ROOT, 'index.js'),
];
const FILE_RE = /\.(js|jsx|ts|tsx)$/;
const GATE_FILE = path.join(ROOT, 'src', 'debug', 'falloutDebug.js');
// Плоский вызов: console.log(...) / console . error (...) / console?.warn?(...)
const FLAT_CONSOLE_RE = /\bconsole\s*(?:\?\.|\.)\s*(?:log|warn|error|info|debug|trace)\s*\(/g;

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

describe('предохранитель: плоских console.* в рантайме нет', () => {
  it('весь логирование — только через гейт falloutDebug', () => {
    const files = SCAN_TARGETS.flatMap((target) => collectFiles(target));
    const violations = [];
    for (const file of files) {
      if (file === GATE_FILE) continue;
      const source = fs.readFileSync(file, 'utf8');
      const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      for (const match of codeOnly.matchAll(FLAT_CONSOLE_RE)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
