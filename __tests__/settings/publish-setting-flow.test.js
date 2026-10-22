// Сквозная проверка публикации кода сеттинга: настоящий git, настоящий
// publish-repositories.mjs, целевой репозиторий — локальный bare.
//
// Проверяем ровно то, что сломалось бы незаметно: сценарий релиза доезжает,
// release.sh исполняемый, release.json и версия манифеста из целевого
// репозитория не откатываются публикацией.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-setting-flow-'));

afterAll(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', ...args], {
  cwd,
  encoding: 'utf8',
});

describe('publish-setting.sh: код едет, релиз остаётся в целевом репозитории', () => {
  it('переносит сценарий релиза и не откатывает release.json с версией', () => {
    // Целевой репозиторий уже прожил релиз 1.0.1: в нём индекс и манифест.
    const seed = path.join(work, 'seed');
    fs.mkdirSync(path.join(seed, 'fallout'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'fallout/manifest.json'), JSON.stringify({
      id: 'fallout', name: 'Fallout 2d20', version: '1.0.1', packFormat: 1, requiresCore: '>=1.0',
    }));
    fs.writeFileSync(path.join(seed, 'release.json'), JSON.stringify({
      schemaVersion: 1,
      repository: 'test/settings',
      settings: { fallout: { id: 'fallout', version: '1.0.1', tag: 'fallout-v1.0.1' } },
    }));
    git(seed, 'init', '-q', '-b', 'main');
    git(seed, 'add', '-A');
    git(seed, 'commit', '-qm', 'релиз 1.0.1');

    const bare = path.join(work, 'origin.git');
    execFileSync('git', ['init', '--bare', '-q', '--initial-branch=main', bare]);
    git(seed, 'remote', 'add', 'origin', bare);
    git(seed, 'push', '-q', 'origin', 'main');

    const config = path.join(work, 'repositories.json');
    fs.writeFileSync(config, JSON.stringify({
      engine: { repository: 'test/engine', url: bare, branch: 'main' },
      setting: {
        repository: 'test/settings',
        url: bare,
        branch: 'main',
        wallets: { fallout: { path: 'modules/fallout', asset: 'fallout.trpg' } },
      },
    }));

    const publish = path.join(work, 'publish');
    const result = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts/publish-repositories.mjs'),
      '--target', 'setting',
      '--config', config,
      '--workdir', publish,
      '--no-pull',
      '--push',
    ], { encoding: 'utf8', env: { ...process.env, PUBLISH_NO_TOKEN: '1' } });

    // git пишет прогресс в stderr — статус важнее.
    expect(result.stderr).not.toMatch(/fatal|error:/i);
    expect(result.status).toBe(0);

    const tree = path.join(publish, 'settings');
    // Сценарий релиза и его зависимости — в целевом репозитории.
    for (const file of [
      'scripts/release.mjs',
      'scripts/release.sh',
      'scripts/lib/semver.mjs',
      'scripts/lib/setting-release.mjs',
      'scripts/lib/app-release.mjs',
      'scripts/lib/release-notes.mjs',
      'tools/pack-setting.py',
      'tools/host-modules.json',
      'release-notes/fallout.md',
      'README.md',
    ]) {
      expect(fs.existsSync(path.join(tree, file)), file).toBe(true);
    }
    expect(fs.statSync(path.join(tree, 'scripts/release.sh')).mode & 0o111).toBeTruthy();

    // Индекс и версия — из целевого репозитория, а не из исходников (1.0.0).
    const index = JSON.parse(fs.readFileSync(path.join(tree, 'release.json'), 'utf8'));
    expect(index.settings.fallout.version).toBe('1.0.1');
    const manifest = JSON.parse(fs.readFileSync(path.join(tree, 'fallout/manifest.json'), 'utf8'));
    expect(manifest.version).toBe('1.0.1');

    // Изменения действительно ушли в origin.
    const pushed = git(bare, 'show', 'main:release.json');
    expect(JSON.parse(pushed).settings.fallout.version).toBe('1.0.1');
    const pushedManifest = git(bare, 'show', 'main:fallout/manifest.json');
    expect(JSON.parse(pushedManifest).version).toBe('1.0.1');
    expect(git(bare, 'ls-tree', 'main', 'scripts/release.sh')).toContain('100755');
  }, 120000);
});
