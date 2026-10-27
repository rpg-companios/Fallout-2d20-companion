// Регрессионный тест патча 462:
// Replit Socket Security Policy блокирует скачивание shell-quote@1.10.0
// (403 Forbidden: Critical CVE в диапазоне 1.8.4–1.10.0) при публикации.
// Проверяем, что overrides в package.json и все записи в package-lock.json
// закреплены на исправленной версии >= 1.12.0.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

const parseSemver = (v) => String(v).replace(/^[^0-9]*/, '').split('.').map((n) => Number(n) || 0);
const isAtLeast = (actual, min) => {
  const [aMaj, aMin, aPat] = parseSemver(actual);
  const [mMaj, mMin, mPat] = parseSemver(min);
  if (aMaj !== mMaj) return aMaj > mMaj;
  if (aMin !== mMin) return aMin > mMin;
  return aPat >= mPat;
};

describe('Патч 462: защита от блокировки Replit Socket Security (shell-quote CVE)', () => {
  it('package.json задаёт overrides для shell-quote >= 1.12.0 и патчевых CVE-зависимостей', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.overrides?.['shell-quote']).toBeDefined();
    expect(isAtLeast(pkg.overrides['shell-quote'], '1.12.0')).toBe(true);
    expect(pkg.pnpm?.overrides?.['shell-quote']).toBeDefined();
    expect(isAtLeast(pkg.pnpm.overrides['shell-quote'], '1.12.0')).toBe(true);
  });

  it('package-lock.json не содержит заблокированного shell-quote 1.8.4–1.10.0', () => {
    const rawLock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
    expect(rawLock).not.toContain('shell-quote-1.10.0.tgz');

    const lock = JSON.parse(rawLock);
    const shellQuoteEntries = Object.entries(lock.packages || {}).filter(([k]) =>
      k.endsWith('node_modules/shell-quote'),
    );
    expect(shellQuoteEntries.length).toBeGreaterThan(0);
    for (const [pkgPath, meta] of shellQuoteEntries) {
      expect(isAtLeast(meta.version, '1.12.0'), `${pkgPath} = ${meta.version}`).toBe(true);
    }
  });
});
