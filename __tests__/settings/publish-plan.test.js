// Публикация в целевые репозитории: правила отбора файлов и release.json.
// Проверяются чистые функции scripts/lib/repository-plan.mjs — без git и сети.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  APP_RELEASE_FILE,
  buildAppReleaseIndex,
  buildReleaseIndex,
  ENGINE_APK_ASSET,
  ENGINE_RELEASE_NOTES,
  engineReleaseTag,
  listRepositoryFiles,
  planEngineFiles,
  hostModuleIds,
  keepPublishedVersion,
  planSettingLegalFiles,
  planSettingReleaseFiles,
  planSettingWallets,
  bumpVersion,
  isLegacyReleaseTag,
  nextReleaseVersion,
  parseReleaseNotes,
  readEngineVersion,
  readReleaseNotes,
  releaseAssetUrls,
  releaseNotesFile,
  releaseNotesLines,
  renderReleaseBody,
  releaseTag,
  renderSettingReadme,
  renderToolsPackageJson,
} from '../../scripts/lib/repository-plan.mjs';

const ROOT = path.resolve(__dirname, '../..');

const makeTree = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-plan-'));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
};

describe('что уезжает в репозиторий движка', () => {
  it('в движок нет папок сеттинга и служебных артефактов', () => {
    const root = makeTree({
      'App.js': '',
      'src/engine/index.js': '',
      'modules/fallout/manifest.json': '{}',
      'patchs/001.patch': '',
      'artifacts/fallout.trpg': '',
      'settings/pins.json': '{}',
      'node_modules/pkg/index.js': '',
      'positronium-boot.zip': 'PK',
    });
    const files = planEngineFiles(root);
    expect(files).toContain('App.js');
    expect(files).toContain('src/engine/index.js');
    expect(files.some((file) => file.startsWith('modules/'))).toBe(false);
    expect(files.some((file) => file.startsWith('patchs/'))).toBe(false);
    expect(files.some((file) => file.startsWith('artifacts/'))).toBe(false);
    expect(files).not.toContain('settings/pins.json');
    expect(files.some((file) => file.startsWith('node_modules/'))).toBe(false);
    // Сборки и архивы уезжают релизами, а не в git.
    expect(files.some((file) => file.endsWith('.zip'))).toBe(false);
    // Тесты и публикация остаются в совмещённом репозитории.
    expect(files.some((file) => file.startsWith('__tests__/'))).toBe(false);
    expect(files.some((file) => file.includes('publish-'))).toBe(false);
  });

  it('в этом репозитории движок и правда отделён от модулей', () => {
    const files = planEngineFiles(ROOT);
    expect(files).toContain('App.js');
    expect(files).toContain('src/engine/settings/settingRelease.js');
    expect(files.some((file) => file.startsWith('modules/'))).toBe(false);
    // APK собирается из репозитория движка: конфигурация сборки едет с ним,
    // а тесты и скрипты публикации — нет.
    expect(files).toContain('eas.json');
    expect(files).toContain('app.json');
    expect(files.some((file) => file.startsWith('__tests__/'))).toBe(false);
    expect(files.some((file) => file.includes('publish-'))).toBe(false);
  });
});

describe('папки под сеттинги в репозитории сеттингов', () => {
  it('каждая папка modules/<id> становится папкой <id> в корне', () => {
    const root = makeTree({
      'modules/fallout/manifest.json': '{"id":"fallout","version":2}',
      'modules/fallout/data/rules.json': '{}',
      'modules/fallout/i18n/ru-RU/screen.json': '{}',
      'modules/fallout/node_modules/skip.js': '',
    });
    const wallets = planSettingWallets(root, {
      fallout: { path: 'modules/fallout', asset: 'fallout.trpg' },
    });
    expect(wallets).toHaveLength(1);
    expect(wallets[0].id).toBe('fallout');
    expect(wallets[0].files).toEqual([
      'data/rules.json',
      'i18n/ru-RU/screen.json',
      'manifest.json',
    ]);
  });

  it('битый id или имя ассета — ошибка публикации', () => {
    const root = makeTree({ 'modules/fallout/manifest.json': '{}' });
    expect(() => planSettingWallets(root, { 'bad id': { path: 'modules/fallout', asset: 'a.trpg' } }))
      .toThrow(/invalid setting id/);
    expect(() => planSettingWallets(root, { fallout: { path: 'modules/fallout', asset: 'a.zip' } }))
      .toThrow(/\.trpg/);
    expect(() => planSettingWallets(root, { heroes: { path: 'modules/missing', asset: 'heroes.trpg' } }))
      .toThrow(/not found/);
  });

  it('настоящее дерево: кошелёк fallout содержит манифест и runtime-entry', () => {
    const wallets = planSettingWallets(ROOT, {
      fallout: { path: 'modules/fallout', asset: 'fallout.trpg' },
    });
    expect(wallets[0].files).toContain('manifest.json');
    expect(wallets[0].files).toContain('runtimeEntry.js');
  });
});

describe('семантические версии релизов', () => {
  it('шаг по уровням: patch, minor, major', () => {
    expect(bumpVersion('1.0.0')).toBe('1.0.1');
    expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
    expect(bumpVersion('1.4.9', 'major')).toBe('2.0.0');
  });

  it('первый выпуск берёт номер из манифеста, дальше — шаг от опубликованного', () => {
    // Старый целочисленный тег не продолжает семантическую линию.
    expect(nextReleaseVersion({ manifestVersion: '1.0.0', publishedVersion: '1' })).toBe('1.0.0');
    expect(nextReleaseVersion({ manifestVersion: '1.0.0', publishedVersion: undefined })).toBe('1.0.0');
    expect(nextReleaseVersion({ manifestVersion: '1.0.0', publishedVersion: '1.0.0' })).toBe('1.0.1');
    expect(nextReleaseVersion({ manifestVersion: '1.0.0', publishedVersion: '1.0.1', level: 'minor' }))
      .toBe('1.1.0');
  });

  it('поднятый вручную манифест публикуется как есть', () => {
    expect(nextReleaseVersion({ manifestVersion: '2.0.0', publishedVersion: '1.0.3' })).toBe('2.0.0');
  });

  it('номер, заданный вручную, обязан быть выше опубликованного', () => {
    expect(nextReleaseVersion({
      manifestVersion: '1.0.0', publishedVersion: '1.0.3', explicitVersion: '1.1.0',
    })).toBe('1.1.0');
    expect(() => nextReleaseVersion({
      manifestVersion: '1.0.0', publishedVersion: '1.0.3', explicitVersion: '1.0.3',
    })).toThrow(/greater than/);
    expect(() => nextReleaseVersion({
      manifestVersion: '1.0.0', publishedVersion: '1.0.3', level: 'beta',
    })).toThrow(/unknown release level/);
  });

  it('старым считается только тег с целым номером', () => {
    expect(isLegacyReleaseTag('fallout', 'fallout-v1')).toBe(true);
    expect(isLegacyReleaseTag('fallout', 'fallout-v1.0.0')).toBe(false);
    expect(isLegacyReleaseTag('other', 'fallout-v1')).toBe(false);
  });
});

describe('заметки о релизах', () => {
  const notes = [
    '# Заметки',
    '',
    '```',
    '## 9.9.9 — пример, не секция',
    '```',
    '',
    '## 1.0.1 — Обновление',
    'Первая строка.',
    'Вторая строка.',
    '',
    '## 1.0.0 — Первый пакет',
    'Старое.',
  ].join('\n');

  it('верхняя секция вне примеров — текст релиза', () => {
    expect(parseReleaseNotes(notes)).toEqual({
      version: '1.0.1',
      title: 'Обновление',
      body: 'Первая строка.\nВторая строка.',
    });
  });

  it('файл без секций и заголовок без версии — ошибка', () => {
    expect(() => parseReleaseNotes('# только заголовок')).toThrow(/no "## <version>" section/);
    expect(() => parseReleaseNotes('## Заголовок\nтекст')).toThrow(/must start with a version/);
  });

  it('в репозитории есть заметки для выпускаемой версии', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/fallout/manifest.json'), 'utf8'));
    const file = readReleaseNotes(ROOT, 'fallout');
    expect(file).not.toBeNull();
    expect(releaseNotesFile('fallout')).toBe('release-notes/fallout.md');
    expect(file.version).toBe(manifest.version);
    expect(file.body.length).toBeGreaterThan(0);
  });

  it('движок не публикует заметки о релизах сеттинга', () => {
    expect(planEngineFiles(ROOT)).not.toContain('release-notes/fallout.md');
  });
});

describe('app-release.json движка', () => {
  const build = (overrides = {}) => buildAppReleaseIndex({
    repository: 'rpg-companios/ttrpg-engine',
    version: '1.0.0',
    notes: { version: '1.0.0', title: 'Первый выпуск', body: 'Приложение без сеттинга.\n\nПравила ставятся пакетом.' },
    asset: ENGINE_APK_ASSET,
    bytes: 20_000_000,
    sha256: 'a'.repeat(64),
    publishedAt: '2026-10-22T00:00:00.000Z',
    ...overrides,
  });

  it('содержит версию, тег, размер, сумму и постоянную ссылку на APK', () => {
    expect(build()).toMatchObject({
      schemaVersion: 1,
      version: '1.0.0',
      tag: 'engine-v1.0.0',
      repository: 'rpg-companios/ttrpg-engine',
      asset: 'positronium.apk',
      bytes: 20_000_000,
      sha256: 'a'.repeat(64),
      downloadUrl: 'https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk',
      pageUrl: 'https://github.com/rpg-companios/ttrpg-engine/releases',
      notes: {
        'ru-RU': [
          'Первый выпуск',
          'Приложение без сеттинга.',
          'Правила ставятся пакетом.',
        ],
      },
    });
  });

  it('заметки для окна: заголовок и абзацы, без markdown-переносов', () => {
    expect(releaseNotesLines({
      version: '1.0.0',
      title: 'Ремонт',
      body: '- Исправлено сохранение\n- Ускорен старт\n\nВторой абзац\nна двух строках',
    })).toEqual({ 'ru-RU': ['Ремонт', 'Исправлено сохранение Ускорен старт', 'Второй абзац на двух строках'] });
  });

  it('тело GitHub Release — заголовок секции и её текст', () => {
    expect(renderReleaseBody({ version: '1.0.0', title: 'Первый выпуск', body: 'Текст.' }))
      .toBe('## 1.0.0 — Первый выпуск\n\nТекст.');
  });

  it('неверные данные не превращаются в индекс', () => {
    expect(() => build({ version: 'v1' })).toThrow(/MAJOR\.MINOR\.PATCH/);
    expect(() => build({ repository: 'engine' })).toThrow(/owner\/name/);
    expect(() => build({ bytes: 0 })).toThrow(/размер APK/);
    expect(() => build({ sha256: 'zzz' })).toThrow(/sha256/);
    expect(() => build({ asset: '../app.apk' })).toThrow(/недопустимое имя/);
  });

  it('релизные скрипты едут в движок: релиз выпускается там же, где сборка', () => {
    const files = planEngineFiles(ROOT);
    for (const file of [
      'scripts/release.mjs',
      'scripts/release.sh',
      'scripts/lib/app-release.mjs',
      'scripts/lib/release-notes.mjs',
    ]) {
      expect(files).toContain(file);
    }
    // Скрипты публикации — механизм смешанного репозитория, в движок не едут.
    expect(files).not.toContain('scripts/publish-engine.sh');
    expect(files).not.toContain('scripts/publish-repositories.mjs');
  });

  it('индекс обновлений не попадает в план публикации: его пишет только релиз', () => {
    expect(APP_RELEASE_FILE).toBe('app-release.json');
    expect(planEngineFiles(ROOT)).not.toContain(APP_RELEASE_FILE);
  });
});

describe('release.json', () => {
  it('тег и адреса архива: стабильные latest и конкретный релиз', () => {
    expect(releaseTag('fallout', '1.0.1')).toBe('fallout-v1.0.1');
    expect(releaseAssetUrls({
      repository: 'rpg-companios/positronium-game-settings',
      tag: 'fallout-v2',
      asset: 'fallout.trpg',
    })).toEqual({
      assetUrl: 'https://github.com/rpg-companios/positronium-game-settings/releases/download/fallout-v2/fallout.trpg',
      latestUrl: 'https://github.com/rpg-companios/positronium-game-settings/releases/latest/download/fallout.trpg',
    });
  });

  it('индекс несёт версию, requiresCore, размер и сумму по каждому кошельку', () => {
    const index = buildReleaseIndex({
      repository: 'rpg-companios/positronium-game-settings',
      generatedAt: '2026-10-20T00:00:00.000Z',
      packages: [{
        id: 'fallout',
        manifest: { id: 'fallout', name: 'Fallout 2d20', version: '2.0.0', packFormat: 1, requiresCore: '>=1.0' },
        asset: 'fallout.trpg',
        bytes: 123,
        sha256: 'b'.repeat(64),
      }],
    });
    expect(index.schemaVersion).toBe(1);
    expect(index.settings.fallout).toMatchObject({
      version: '2.0.0',
      requiresCore: '>=1.0',
      tag: 'fallout-v2.0.0',
      bytes: 123,
      sha256: 'b'.repeat(64),
    });
  });

  it('сценарий релиза едет в репозиторий сеттинга', () => {
    const files = planSettingReleaseFiles(ROOT);
    expect(files).toEqual([
      'scripts/release.mjs',
      'scripts/release.sh',
      'scripts/lib/semver.mjs',
      'scripts/lib/release-notes.mjs',
      'scripts/lib/app-release.mjs',
      'scripts/lib/setting-release.mjs',
    ]);
    // Скрипт запускают как ./scripts/release.sh — право на запуск обязательно.
    expect(fs.statSync(path.join(ROOT, 'scripts/release.sh')).mode & 0o111).toBeTruthy();
    const source = fs.readFileSync(path.join(ROOT, 'scripts/release.mjs'), 'utf8');
    expect(source).toContain('pack-setting.py');
    expect(source).toContain('buildReleaseIndex');
    expect(source).toContain('createRelease');
  });

  it('публикация кода не откатывает версию, выпущенную релизом', () => {
    const incoming = { id: 'fallout', version: '1.0.0' };
    expect(keepPublishedVersion(incoming, { version: '1.0.1' }).version).toBe('1.0.1');
    expect(keepPublishedVersion(incoming, { version: '1.0.0' })).toBe(incoming);
    // Номер подняли в исходниках — он и уезжает.
    expect(keepPublishedVersion({ id: 'fallout', version: '1.1.0' }, { version: '1.0.1' }).version).toBe('1.1.0');
  });

  it('инструменты сеттинга уезжают с лицензией движка', () => {
    expect(planSettingLegalFiles(ROOT)).toEqual(['LICENSE', 'NOTICE']);
  });

  it('README репозитория сеттингов объясняет папки, сборку и лицензию', () => {
    const readme = renderSettingReadme({
      repository: 'rpg-companios/positronium-game-settings',
      wallets: { fallout: { path: 'modules/fallout' } },
      engineRepository: 'rpg-companios/ttrpg-engine',
    });
    expect(readme).toContain('fallout/');
    expect(readme).toContain('tools/pack-setting.py');
    expect(readme).toContain('npm install --prefix tools');
    expect(readme).toContain('engine:<id>');
    expect(readme).toContain('AGPL-3.0');
  });
});

describe('shell-обёртки', () => {
  const read = (name) => fs.readFileSync(path.join(ROOT, 'scripts', name), 'utf8');

  it('движок публикуется обёрткой с --target engine и --push', () => {
    const script = read('publish-engine.sh');
    expect(script).toContain('--target engine');
    expect(script).toContain('--push');
    expect(script).toContain('--dry-run');
  });

  it('сеттинг публикуется обёрткой с --target setting и --push', () => {
    const script = read('publish-setting.sh');
    expect(script).toContain('--target setting');
    expect(script).toContain('--push');
    expect(script).toContain('--dry-run');
    // Релиз живёт в репозитории сеттинга, а не здесь.
    expect(script).not.toMatch(/CMD\+=\(--release\)/);
    expect(script).toContain('./scripts/release.sh');
  });

  it('обёртка публикации отклоняет флаги релиза с подсказкой', () => {
    for (const name of ['publish-setting.sh', 'publish-engine.sh']) {
      const script = read(name);
      expect(script).toContain('--release');
      expect(script).toContain('release.sh');
      expect(script).toContain('только'); // «здесь только код»
    }
  });

  it('публикация отклоняет --release: релиз переехал в целевой репозиторий', () => {
    const result = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts/publish-repositories.mjs'), '--target', 'setting', '--release',
    ], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('release.sh');
    expect(result.stderr).toContain('целевом репозитории');
  });

  it('публикация не собирает .trpg и не ставит esbuild', () => {
    // Сборка — забота ./scripts/release.sh в целевом репозитории: здесь нет
    // ни упаковщика, ни кэша сборщика, ни NODE_PATH.
    const script = read('publish-setting.sh');
    expect(script).not.toContain('esbuild');
    expect(script).not.toContain('NODE_PATH');
    expect(script).not.toContain('python3');
  });

  it('README объясняет, что сборщик живёт в tools/, а checkout движка не нужен', () => {
    const readme = renderSettingReadme({
      repository: 'rpg-companios/positronium-game-settings',
      wallets: { fallout: { path: 'modules/fallout' } },
      engineRepository: 'rpg-companios/ttrpg-engine',
    });
    expect(readme).toContain('npm install --prefix tools');
    expect(readme).toContain('Движок для сборки не нужен');
    expect(readme).not.toContain('POSITRONIUM_ENGINE');
  });

  it('обёртки исполняемые', () => {
    for (const name of ['publish-engine.sh', 'publish-setting.sh']) {
      const mode = fs.statSync(path.join(ROOT, 'scripts', name)).mode;
      expect(mode & 0o111).toBeTruthy();
    }
  });
});

describe('релиз сеттинга — в репозитории сеттинга', () => {
  // Дерево как в positronium-game-settings: кошелёк, tools/, scripts/release.*
  const makeSettingRepo = ({ notes, manifestVersion = '1.0.0', published = '1.0.0' }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-cli-'));
    fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts/release.mjs'), path.join(root, 'scripts/release.mjs'));
    for (const file of ['semver.mjs', 'release-notes.mjs', 'app-release.mjs', 'setting-release.mjs']) {
      fs.copyFileSync(path.join(ROOT, 'scripts/lib', file), path.join(root, 'scripts/lib', file));
    }
    fs.mkdirSync(path.join(root, 'tools'));
    fs.writeFileSync(path.join(root, 'tools/pack-setting.py'), '# stub: сборку проверяет релиз в цельном дереве\n');
    fs.mkdirSync(path.join(root, 'fallout'));
    fs.writeFileSync(path.join(root, 'fallout/manifest.json'), JSON.stringify({
      id: 'fallout', name: 'Fallout 2d20', version: manifestVersion, packFormat: 1, requiresCore: '>=1.0',
    }));
    fs.mkdirSync(path.join(root, 'release-notes'));
    fs.writeFileSync(path.join(root, 'release-notes/fallout.md'), notes);
    if (published !== null) {
      fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({
        schemaVersion: 1,
        repository: 'rpg-companios/positronium-game-settings',
        settings: { fallout: { id: 'fallout', version: published } },
      }));
    }
    return root;
  };

  const runRelease = (root, args = []) => spawnSync(process.execPath, [
    path.join(root, 'scripts/release.mjs'), '--dry-run', '--repo', 'rpg-companios/positronium-game-settings', ...args,
  ], { encoding: 'utf8' });

  it('dry-run поднимает патч от release.json и называет тег', () => {
    const root = makeSettingRepo({ notes: '## 1.0.1 — Ремонт\nТекст.\n' });
    const result = runRelease(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fallout: 1.0.0 → 1.0.1');
    expect(result.stdout).toContain('fallout-v1.0.1');
    // План ничего не пишет: индекс и манифест меняет только настоящий релиз.
    expect(JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8')).settings.fallout.version).toBe('1.0.0');
  });

  it('--bump minor и --version задают шаг', () => {
    const minor = runRelease(makeSettingRepo({ notes: '## 1.1.0 — Новое\n' }), ['--bump', 'minor']);
    expect(minor.status).toBe(0);
    expect(minor.stdout).toContain('fallout-v1.1.0');

    const explicit = runRelease(makeSettingRepo({ notes: '## 2.0.0 — Крупное\n' }), ['--version', '2.0.0']);
    expect(explicit.status).toBe(0);
    expect(explicit.stdout).toContain('fallout-v2.0.0');
  });

  it('заметки про другую версию останавливают релиз до сборки', () => {
    const result = runRelease(makeSettingRepo({ notes: '## 1.0.0 — Старое\n' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('верхняя секция release-notes/fallout.md');
    expect(result.stderr).toContain('1.0.1');
  });

  it('первый релиз без release.json берёт версию из манифеста', () => {
    const root = makeSettingRepo({ notes: '## 1.0.0 — Первый\n', published: null });
    const result = runRelease(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fallout-v1.0.0');
    // dry-run ничего не пишет: индекс создаст только настоящий релиз.
    expect(fs.existsSync(path.join(root, 'release.json'))).toBe(false);
  });

  it('--version при нескольких сеттингах требует --setting', () => {
    const root = makeSettingRepo({ notes: '## 1.0.1 — A\n' });
    fs.mkdirSync(path.join(root, 'westland'));
    fs.writeFileSync(path.join(root, 'westland/manifest.json'), JSON.stringify({
      id: 'westland', name: 'Westland', version: '1.0.0', packFormat: 1, requiresCore: '>=1.0',
    }));
    fs.writeFileSync(path.join(root, 'release-notes/westland.md'), '## 1.0.1 — B\n');

    const all = runRelease(root, ['--version', '1.0.1']);
    expect(all.status).toBe(1);
    expect(all.stderr).toContain('--setting');

    const one = runRelease(root, ['--setting', 'fallout']);
    expect(one.status).toBe(0);
    expect(one.stdout).toContain('fallout-v1.0.1');
    expect(one.stdout).not.toContain('westland-v');
    expect(one.stdout).not.toContain('westland:');
  });

  it('флаги движка в репозитории сеттинга отклоняются', () => {
    const result = runRelease(makeSettingRepo({ notes: '## 1.0.1 — Ремонт\n' }), ['--aab']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('относятся к релизу движка');
  });
});

describe('конфигурация в репозитории', () => {
  it('settings/repositories.json: два адреса и кошелёк fallout', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings/repositories.json'), 'utf8'));
    expect(config.engine.repository).toBe('rpg-companios/ttrpg-engine');
    expect(config.setting.repository).toBe('rpg-companios/positronium-game-settings');
    expect(config.setting.wallets.fallout.path).toBe('modules/fallout');
  });

  it('settings/release-sources.json: движок не знает ни одного сеттинга заранее', () => {
    const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings/release-sources.json'), 'utf8'));
    expect(sources.settings).toEqual({});
    expect(sources.defaults.checkIntervalHours).toBeGreaterThan(0);
  });
});

describe('сеттинг — самодостаточный плагин', () => {
  it('tools/ несёт свой package.json со сборщиком', () => {
    const pkg = JSON.parse(renderToolsPackageJson({ engineVersion: '^0.28.2' }));
    expect(pkg.private).toBe(true);
    expect(pkg.devDependencies.esbuild).toBe('^0.28.2');
  });

  it('движок объявляет host-модули, а кошелёк использует только их', () => {
    const host = new Set(hostModuleIds(ROOT));
    expect(host.size).toBeGreaterThan(40);

    const used = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(full);
          continue;
        }
        if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/(['"])(engine:[^'"]+)\1/g)) used.add(match[2]);
      }
    };
    walk(path.join(ROOT, 'modules/fallout'));

    expect([...used].filter((id) => !host.has(id))).toEqual([]);
  });

  it('в кошельке нет относительных импортов за его пределы', () => {
    // Именно они заставляли упаковщика требовать checkout движка.
    const wallet = path.join(ROOT, 'modules/fallout');
    const escaping = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/(['"])(\.{1,2}\/[^'"]+)\1/g)) {
          const target = path.resolve(path.dirname(full), match[2]);
          if (!target.startsWith(wallet)) escaping.push(`${path.relative(wallet, full)} -> ${match[2]}`);
        }
      }
    };
    walk(wallet);
    expect(escaping).toEqual([]);
  });
});

describe('оформление репозитория движка', () => {
  it('README движка объясняет, что это и как собрать APK', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('# Positronium');
    expect(readme).toContain('npm run apk');
    expect(readme).toContain('npm run apk:local');
    expect(readme).toContain('engine-v');
    expect(readme).toContain('AGPL-3.0');
    // README уезжает в движок, а не в репозиторий сеттинга.
    expect(planEngineFiles(ROOT)).toContain('README.md');
  });

  it('релизы движка: тег engine-v<версия> и версия из app.json', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    expect(engineReleaseTag(app.expo.version)).toBe(`engine-v${app.expo.version}`);
    expect(readEngineVersion(ROOT)).toBe(app.expo.version);
    expect(ENGINE_RELEASE_NOTES).toBe('release-notes/engine.md');
  });

  it('заметки о релизе движка есть и совпадают с версией приложения', () => {
    const notes = readReleaseNotes(ROOT, 'engine');
    expect(notes).not.toBeNull();
    expect(notes.version).toBe(readEngineVersion(ROOT));
    expect(notes.body.length).toBeGreaterThan(0);
  });

  it('в движок едут только его заметки, в сеттинг — только его', () => {
    const engineFiles = planEngineFiles(ROOT);
    expect(engineFiles).toContain(ENGINE_RELEASE_NOTES);
    expect(engineFiles).not.toContain('release-notes/fallout.md');

    const wallets = planSettingWallets(ROOT, {
      fallout: { path: 'modules/fallout', asset: 'fallout.trpg' },
    });
    const settingNotes = releaseNotesFile('fallout');
    expect(fs.existsSync(path.join(wallets[0].sourceDir, '..', '..', settingNotes))).toBe(true);
    expect(fs.existsSync(path.join(wallets[0].sourceDir, ENGINE_RELEASE_NOTES))).toBe(false);
  });
});
