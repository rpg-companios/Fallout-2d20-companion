import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';

const { cacheSettingPackage } = vi.hoisted(() => ({
  cacheSettingPackage: vi.fn(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new Uint8Array(32).fill(0xab).buffer),
}));
vi.mock('../../src/engine/settings/settingPackageCache', () => ({
  cacheSettingPackage,
  deleteCachedSettingPackage: vi.fn(),
  readCachedSettingFile: vi.fn(),
}));

import { installSettingPackage } from '../../src/engine/settings/settingPackageInstaller';

const makeValidArchive = () => {
  const manifest = {
    id: 'custom_setting',
    name: 'Custom Setting',
    version: '2.0.0',
    requiresCore: '>=1.0',
    defaultLocale: 'en-EN',
    locales: ['en-EN'],
    packFormat: 1,
    runtime: { apiVersion: 1, source: 'runtimeEntry.js', entry: 'runtime/setting.cjs' },
    files: ['manifest.json', 'data/rules.json', 'runtimeEntry.js', 'runtime/setting.cjs'],
  };
  return zipSync({
    'custom_setting/manifest.json': strToU8(JSON.stringify(manifest)),
    'custom_setting/data/rules.json': strToU8('{"rules":[]}'),
    'custom_setting/runtimeEntry.js': strToU8('export default () => ({ id: "custom_setting" });'),
    'custom_setting/runtime/setting.cjs': strToU8('module.exports = () => ({ id: "custom_setting" });'),
  });
};

describe('setting package installer', () => {
  beforeEach(() => {
    cacheSettingPackage.mockReset();
    cacheSettingPackage.mockImplementation(async (options) => `${options.manifest.id}/${options.digest}`);
  });

  it('validates, hashes, and caches a package without activating it', async () => {
    const bytes = makeValidArchive();
    const installed = await installSettingPackage({ name: 'custom.trpg', bytes });

    expect(installed).toMatchObject({
      id: 'custom_setting',
      name: 'Custom Setting',
      version: '2.0.0',
      digest: 'ab'.repeat(32),
      cacheKey: `custom_setting/${'ab'.repeat(32)}`,
      runtime: { apiVersion: 1, source: 'runtimeEntry.js', entry: 'runtime/setting.cjs' },
      sourceFileName: 'custom.trpg',
    });
    expect(installed).not.toHaveProperty('activeId');
    expect(cacheSettingPackage).toHaveBeenCalledOnce();
    expect(cacheSettingPackage.mock.calls[0][0].files.map(({ path }) => path))
      .toEqual(['manifest.json', 'data/rules.json', 'runtimeEntry.js', 'runtime/setting.cjs']);
  });

  it('refuses a reserved built-in ID and non-.trpg filenames', async () => {
    await expect(installSettingPackage(
      { name: 'custom.trpg', bytes: makeValidArchive() },
      { reservedIds: ['custom_setting'] },
    )).rejects.toThrow(/already provided by the app/);
    await expect(installSettingPackage({ name: 'custom.zip', bytes: makeValidArchive() }))
      .rejects.toThrow(/only .trpg archives/);
    expect(cacheSettingPackage).not.toHaveBeenCalled();
  });
});
