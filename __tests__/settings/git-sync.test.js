// Обновление checkout'а перед релизом (scripts/lib/git-sync.mjs).
//
// Правило: релиз собирается из origin. Модуль обязан уметь три вещи —
// fast-forward без потери локальной работы, остановка на грязном дереве и
// остановка на разошедшихся ветках (push индекса всё равно не пройдёт).
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  currentGitBranch,
  isGitCheckout,
  syncCheckout,
} from '../../scripts/lib/git-sync.mjs';

const temporary = [];
afterEach(() => {
  while (temporary.length > 0) fs.rmSync(temporary.pop(), { recursive: true, force: true });
});

const tempDir = (prefix = 'git-sync-') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporary.push(dir);
  return dir;
};

const git = (root, args) => execFileSync(
  'git',
  ['-c', 'user.name=Release test', '-c', 'user.email=release@example.test', ...args],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);

/** origin.git + рабочая копия seed (пушит) + clone (тот, что «в Replit»). */
const makeRepos = () => {
  const root = tempDir();
  const origin = path.join(root, 'origin.git');
  git(root, ['init', '--bare', '-b', 'main', origin]);

  const seed = path.join(root, 'seed');
  git(root, ['clone', origin, seed]);
  fs.writeFileSync(path.join(seed, 'README.md'), 'one\n');
  fs.writeFileSync(path.join(seed, 'scripts.txt'), 'v1\n');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-m', 'init']);
  git(seed, ['push', 'origin', 'main']);

  const clone = path.join(root, 'clone');
  git(root, ['clone', origin, clone]);
  return { root, origin, seed, clone };
};

const advance = (seed, { readme = null, scripts = 'v2\n' } = {}) => {
  if (readme !== null) fs.writeFileSync(path.join(seed, 'README.md'), readme);
  fs.writeFileSync(path.join(seed, 'scripts.txt'), scripts);
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-m', 'next']);
  git(seed, ['push', 'origin', 'main']);
};

describe('syncCheckout', () => {
  it('подтягивает fast-forward и перечисляет изменённые файлы', () => {
    const { seed, clone } = makeRepos();
    advance(seed, { readme: 'two\n' });

    const messages = [];
    const result = syncCheckout({ root: clone, log: (line) => messages.push(line) });

    expect(result.updated).toBe(true);
    expect(result.branch).toBe('main');
    expect(result.changed.sort()).toEqual(['README.md', 'scripts.txt']);
    expect(fs.readFileSync(path.join(clone, 'README.md'), 'utf8')).toBe('two\n');
    expect(messages.join('\n')).toContain('обновлено');
    expect(currentGitBranch(clone)).toBe('main');
  });

  it('checkout уже на origin — отчитывается и ничего не трогает', () => {
    const { clone } = makeRepos();
    const messages = [];
    const result = syncCheckout({ root: clone, log: (line) => messages.push(line) });

    expect(result.updated).toBe(false);
    expect(result.changed).toEqual([]);
    expect(messages.join('\n')).toContain('код уже совпадает');
  });

  it('незакоммиченные правки — стоп с именами файлов, без merge', () => {
    const { seed, clone } = makeRepos();
    advance(seed, { readme: 'from origin\n' });
    fs.writeFileSync(path.join(clone, 'README.md'), 'local work\n');

    expect(() => syncCheckout({ root: clone, log: () => {} }))
      .toThrow(/незакоммиченные изменения.*README\.md.*--no-pull/s);
    expect(fs.readFileSync(path.join(clone, 'README.md'), 'utf8')).toBe('local work\n');
  });

  it('локальные коммиты впереди origin — стоп «разошлась»', () => {
    const { seed, clone } = makeRepos();
    fs.writeFileSync(path.join(clone, 'local.txt'), 'local\n');
    git(clone, ['add', '-A']);
    git(clone, ['commit', '-m', 'not pushed']);
    advance(seed, { readme: 'from origin\n' });

    expect(() => syncCheckout({ root: clone, log: () => {} }))
      .toThrow(/разошлась с origin\/main.*--no-pull/s);
    expect(fs.existsSync(path.join(clone, 'local.txt'))).toBe(true);
  });

  it('dry-run показывает обновление, но не меняет рабочие файлы', () => {
    const { seed, clone } = makeRepos();
    advance(seed, { readme: 'two\n' });

    const messages = [];
    const result = syncCheckout({ root: clone, dryRun: true, log: (line) => messages.push(line) });

    expect(result.updated).toBe(false);
    expect(result.available).toBeTruthy();
    expect(fs.readFileSync(path.join(clone, 'README.md'), 'utf8')).toBe('one\n');
    expect(messages.join('\n')).toContain('dry-run: не применяю');
  });

  it('не git-репозиторий и отсутствие remote — пропуск, а не падение', () => {
    const plain = tempDir('git-sync-plain-');
    expect(isGitCheckout(plain)).toBe(false);
    const skipped = syncCheckout({ root: plain, log: () => {} });
    expect(skipped.skipped).toBe('not-a-git-repo');

    const local = tempDir('git-sync-local-');
    git(local, ['init', '-b', 'main']);
    fs.writeFileSync(path.join(local, 'file.txt'), 'x\n');
    git(local, ['add', '-A']);
    git(local, ['commit', '-m', 'init']);
    expect(syncCheckout({ root: local, log: () => {} }).skipped).toBe('no-remote');
  });
});
