// Регрессионные тесты патча 458:
// служебные каталоги .kiro, .install-backup, .installbackup, .publish (и .agents)
// полностью исключены из обхода Metro (blockList + watchFolders), расчёта
// отпечатка исходников server/start.js, запуска Vitest и обходчиков-предохранителей.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import metroConfig from '../../metro.config.js';
import vitestConfig from '../../vitest.config.js';
import {
  IGNORED_WORKSPACE_DIRS,
  computeSourceFingerprint,
} from '../../server/start.js';

const ROOT = path.resolve(__dirname, '../..');

describe('Патч 458: исключение .kiro, .install-backup/.installbackup и .publish из сборки и проверок', () => {
  it('Metro blockList блокирует .kiro, .install-backup, .installbackup и .publish внутри проекта, не трогая pnpm', () => {
    const blockList = metroConfig.resolver.blockList;
    const isBlocked = (p) => blockList.some((re) => re.test(p));

    expect(isBlocked(path.join(ROOT, '.kiro/specs/test.md'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.install-backup/2026-10-27/App.js'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.installbackup/2026-10-27/App.js'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.publish/ttrpg-engine/package.json'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.publish/positronium-game-settings/index.js'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.agents/memory/MEMORY.md'))).toBe(true);

    // Глобальный кэш pnpm вне проекта остаётся доступным
    expect(isBlocked('/home/runner/.local/share/pnpm/expo/index.js')).toBe(false);
    // Боевые исходники остаются доступными
    expect(isBlocked(path.join(ROOT, 'App.js'))).toBe(false);
    expect(isBlocked(path.join(ROOT, 'src/room/roomStore.ts'))).toBe(false);
  });

  it('отпечаток исходников server/start.js не реагирует на файлы внутри .kiro, .install-backup, .installbackup, .publish', () => {
    for (const dir of ['.kiro', '.install-backup', '.installbackup', '.publish', '.agents']) {
      expect(IGNORED_WORKSPACE_DIRS.has(dir)).toBe(true);
    }

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'positronium-458-'));
    try {
      fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, 'App.js'), 'export default function App() {}\n', 'utf8');
      fs.writeFileSync(path.join(tmpRoot, 'src', 'a.js'), 'export const a = 1;\n', 'utf8');

      const fpBefore = computeSourceFingerprint(tmpRoot);

      for (const ignored of ['.kiro', '.install-backup', '.installbackup', '.publish', '.agents']) {
        const sub = path.join(tmpRoot, ignored, 'nested');
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, 'App.js'), `// copy in ${ignored}\n`, 'utf8');
        fs.writeFileSync(path.join(sub, 'extra.ts'), 'export const x: number = 2;\n', 'utf8');
      }

      const fpAfter = computeSourceFingerprint(tmpRoot);
      expect(fpAfter).toBe(fpBefore);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('Vitest и обходчики-предохранители исключают .kiro, .install-backup, .installbackup и .publish', () => {
    const excludes = vitestConfig?.test?.exclude || [];
    expect(excludes).toContain('.kiro/**');
    expect(excludes).toContain('.install-backup/**');
    expect(excludes).toContain('.installbackup/**');
    expect(excludes).toContain('.publish/**');

    for (const rel of [
      '__tests__/settings/settings-boundary.test.js',
      '__tests__/typescript/no-js-ts-duplicates.test.js',
      '__tests__/typescript/tsconfig-coverage.test.js',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toContain("'.kiro'");
      expect(src).toContain("'.install-backup'");
      expect(src).toContain("'.installbackup'");
      expect(src).toContain("'.publish'");
    }
  });
});
