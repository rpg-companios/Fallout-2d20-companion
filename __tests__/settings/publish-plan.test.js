// Публикация в целевые репозитории: правила отбора файлов и release.json.
// Проверяются чистые функции scripts/lib/repository-plan.mjs — без git и сети.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildReleaseIndex,
  listRepositoryFiles,
  planEngineFiles,
  planSettingLegalFiles,
  planSettingWallets,
  releaseAssetUrls,
  releaseTag,
  renderSettingReadme,
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

describe('release.json', () => {
  it('тег и адреса архива: стабильные latest и конкретный релиз', () => {
    expect(releaseTag('fallout', 2)).toBe('fallout-v2');
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
        manifest: { id: 'fallout', name: 'Fallout 2d20', version: 2, packFormat: 1, requiresCore: '>=1.0' },
        asset: 'fallout.trpg',
        bytes: 123,
        sha256: 'b'.repeat(64),
      }],
    });
    expect(index.schemaVersion).toBe(1);
    expect(index.settings.fallout).toMatchObject({
      version: 2,
      requiresCore: '>=1.0',
      tag: 'fallout-v2',
      bytes: 123,
      sha256: 'b'.repeat(64),
    });
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
    expect(readme).toContain('POSITRONIUM_ENGINE');
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

  it('сеттинг публикуется обёрткой с --target setting, --push и --release', () => {
    const script = read('publish-setting.sh');
    expect(script).toContain('--target setting');
    expect(script).toContain('--push');
    expect(script).toContain('--release');
    expect(script).toContain('--no-release');
  });

  it('сборщик ставится в кэш вне проекта, дерево node_modules не трогается', () => {
    const script = read('publish-setting.sh');
    // npm install --prefix <кэш> + NODE_PATH: иначе в pnpm-дереве Replit
    // падает «Cannot read properties of null (reading 'isDescendantOf')».
    expect(script).toContain('--prefix "$TOOL_CACHE_DIR"');
    expect(script).toContain('NODE_PATH');
    expect(script).not.toMatch(/npm install\s+--no-save[^\n]*esbuild/);
  });

  it('README репозитория сеттинга предупреждает, что npm install там не нужен', () => {
    const readme = renderSettingReadme({
      repository: 'rpg-companios/positronium-game-settings',
      wallets: { fallout: { path: 'modules/fallout' } },
      engineRepository: 'rpg-companios/ttrpg-engine',
    });
    expect(readme).toContain('npm install');
    expect(readme).toMatch(/нет Node-проекта/);
  });

  it('обёртки исполняемые', () => {
    for (const name of ['publish-engine.sh', 'publish-setting.sh']) {
      const mode = fs.statSync(path.join(ROOT, 'scripts', name)).mode;
      expect(mode & 0o111).toBeTruthy();
    }
  });
});

describe('конфигурация в репозитории', () => {
  it('settings/repositories.json: два адреса и кошелёк fallout', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings/repositories.json'), 'utf8'));
    expect(config.engine.repository).toBe('rpg-companios/ttrpg-engine');
    expect(config.setting.repository).toBe('rpg-companios/positronium-game-settings');
    expect(config.setting.wallets.fallout.path).toBe('modules/fallout');
  });

  it('settings/release-sources.json: источник обновления указывает на репозиторий сеттингов', () => {
    const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings/release-sources.json'), 'utf8'));
    expect(sources.settings.fallout.repository).toBe('rpg-companios/positronium-game-settings');
    expect(sources.defaults.checkIntervalHours).toBeGreaterThan(0);
  });
});
