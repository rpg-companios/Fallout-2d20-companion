/**
 * Contract: no Cyrillic (i.e. localized Russian text) in source code outside i18n.
 *
 * Rule:
 *   - i18n/ru-RU/** and i18n/ru-RU.json files are the ONLY place for Russian
 *     display strings. Source code (`*.js`, `*.jsx`, `*.ts`, `*.tsx`) should
 *     stay locale-neutral and pull display text via tCharacterScreen(...) /
 *     tHomeScreen(...) / etc.
 *
 * Strategy:
 *   - We scan all JS/TS source under repo root, EXCLUDING:
 *       * /node_modules/, /.git/, /__tests__/, /assets/
 *       * /i18n/** (the only legitimate home for localized strings)
 *       * *.test.js / *.test.jsx / *.test.ts (test fixtures may need ru text)
 *   - Comments (// ... and /* ... *\/) are stripped before scanning so doc
 *     comments and JSDoc examples don't trip the check.
 *   - A baseline (domain/cyrillic-baseline.json) freezes the *current* list
 *     of legacy files that still contain Russian. The test:
 *       * FAILS if a NEW file outside the baseline contains Cyrillic
 *         (this is a regression — adding Russian to fresh code).
 *       * WARNS (via expect.fail) if a baseline file is now CLEAN
 *         (you fixed it — please remove it from baseline to keep the
 *         ratchet tight).
 *       * Passes if the set is exactly the baseline.
 *
 * This is a "ratchet" test: every removal from baseline is permanent.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';


const ROOT = resolve(__dirname, '..');
const CYRILLIC = /[\u0400-\u04FF]/;

// Load baseline via readFileSync (avoids Node 18- import-attributes mismatch).
const baselineRaw = JSON.parse(
  readFileSync(join(__dirname, 'cyrillic-baseline.json'), 'utf-8'),
);

/** Recursively collect all source files under a directory. */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    if (entry.name.startsWith('.')) continue;          // .git, .vscode, etc.
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.includes('/i18n/')) continue;           // SoT for localized strings
      if (full.includes('/__tests__/')) continue;      // test fixtures
      if (full.includes('/assets/')) continue;         // binary assets
      out.push(...collectSourceFiles(full));
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Replace comments with whitespace (keeping line numbers / column positions
 * intact), so a literal `'Ремонт'` inside a `//` or `/* *\/` comment is no
 * longer detected.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

function findCyrillicLines(text) {
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (CYRILLIC.test(lines[i])) hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

describe('no Cyrillic in source code outside i18n/', () => {
  const baseline = new Set(baselineRaw);
  const sourceFiles = collectSourceFiles(ROOT);
  const offenders = new Map(); // relPath -> hits[]

  for (const abs of sourceFiles) {
    const rel = abs.replace(ROOT + '/', '');
    const text = stripComments(readFileSync(abs, 'utf-8'));
    const hits = findCyrillicLines(text);
    if (hits.length) offenders.set(rel, hits);
  }

  const currentOffenders = new Set(offenders.keys());
  const newRegressions = [...currentOffenders].filter((f) => !baseline.has(f));
  const fixed         = [...baseline].filter((f) => !currentOffenders.has(f));

  it('no NEW files with Cyrillic outside i18n/', () => {
    if (newRegressions.length === 0) return;
    const details = newRegressions
      .map((f) => {
        const sample = offenders.get(f).slice(0, 3)
          .map((h) => `      L${h.line}: ${h.text.slice(0, 100)}`).join('\n');
        return `  - ${f}  (${offenders.get(f).length} lines)\n${sample}`;
      })
      .join('\n');
    throw new Error(
      `Cyrillic text found in NEW source files (forbidden — use i18n keys via ` +
      `tXxx(...) helpers; the only allowed home for localized strings is ` +
      `i18n/<locale>/):\n${details}\n\n` +
      `If this is legitimately a Russian-only screen helper, add the file ` +
      `path to domain/cyrillic-baseline.json — but consider moving the text ` +
      `to i18n/<locale>/... first.`,
    );
  });

  it('files removed from baseline are still clean (ratchet)', () => {
    if (fixed.length === 0) return;
    throw new Error(
      `🎉 Cyrillic was removed from these files. Please DELETE them from ` +
      `domain/cyrillic-baseline.json so the ratchet stays tight:\n  - ` +
      fixed.join('\n  - '),
    );
  });

  it('baseline reports current debt size', () => {
    // Not a real assertion — this just prints progress in test output.
    const stillDirty = [...currentOffenders].filter((f) => baseline.has(f)).length;
    // eslint-disable-next-line no-console
    console.log(
      `\n  [cyrillic-baseline] still-dirty: ${stillDirty} / baseline: ${baseline.size}` +
      `  →  remaining work: ${stillDirty} files\n`,
    );
    expect(baseline.size).toBeGreaterThanOrEqual(stillDirty);
  });
});
