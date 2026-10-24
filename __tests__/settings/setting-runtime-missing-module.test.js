// Что видит человек, если пакету не хватает host-модуля ЭТОЙ сборки.
//
// Так было с `react/jsx-runtime` на APK 1.0.1: пакет ставился, активация
// падала. Старое сообщение APK прятало совсем, новое — переводится и говорит,
// каких именно модулей нет.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/engine/settings/settingPackageCache', () => ({
  cacheSettingPackage: vi.fn(),
  deleteCachedSettingPackage: vi.fn(),
  getCachedSettingFileUri: vi.fn(async () => 'file:///cache/x'),
  readCachedSettingFile: vi.fn(async () => new TextEncoder().encode('{}')),
}));
vi.mock('../../src/engine/settings/settingCompatibility', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Проверки до исполнения пакета здесь не проходят: манифеста нет.
    assertSettingCompatibility: () => true,
    checkDeclaredServices: () => [],
  };
});

import { SETTING_COMPATIBILITY_CODES } from '../../src/engine/settings/settingCompatibility';

const bundle = [
  'module.exports = function create() {',
  "  var jsx = require('react/jsx-runtime');",
  "  return { id: 'demo', screens: [{ id: 'main', title: 'Main', component: jsx }] };",
  '};',
].join('\n');

const load = async (modules) => {
  const { readCachedSettingFile } = await import('../../src/engine/settings/settingPackageCache');
  readCachedSettingFile.mockImplementation(async (cacheKey, filePath) => {
    if (filePath === 'manifest.json') {
      return new TextEncoder().encode(JSON.stringify({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        requiresCore: '>=1.0',
        defaultLocale: 'ru-RU',
        locales: ['ru-RU'],
        packFormat: 1,
        files: ['manifest.json', 'runtime/setting.cjs'],
        runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
      }));
    }
    return new TextEncoder().encode(bundle);
  });
  const { openSettingPackageRuntime } = await import('../../src/engine/settings/settingPackageRuntime');
  const runtime = await openSettingPackageRuntime('demo/'.concat('a'.repeat(64)));
  return runtime.loadModule({ settingId: 'demo', apiVersion: 1, modules });
};

describe('нехватка host-модуля объясняется человеку', () => {
  it('это отказ по совместимости, а не «не удалось запустить»', async () => {
    await expect(load({ react: {} })).rejects.toMatchObject({
      code: SETTING_COMPATIBILITY_CODES.MISSING_HOST_MODULES,
      problems: [{
        code: SETTING_COMPATIBILITY_CODES.MISSING_HOST_MODULES,
        params: { modules: ['react/jsx-runtime'] },
      }],
    });
  });

  it('техническая причина сохранена в cause', async () => {
    const error = await load({ react: {} }).catch((caught) => caught);
    expect(error.cause?.message).toContain('unavailable host module: react/jsx-runtime');
  });
});
