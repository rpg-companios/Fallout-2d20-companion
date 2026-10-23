import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new Uint8Array(32).fill(0x11).buffer),
}));
vi.mock('../../src/engine/settings/settingPackageCache', () => ({
  cacheSettingPackage: vi.fn(async (options) => `${options.manifest.id}/${options.digest}`),
  deleteCachedSettingPackage: vi.fn(),
  readCachedSettingFile: vi.fn(),
  getCachedSettingFileUri: vi.fn(async () => 'file://cache/entry.cjs'),
}));

import { ENGINE_VERSION } from '../../src/engine/version.js';
import {
  assertSettingCompatibility,
  checkDeclaredServices,
  checkRuntimeApi,
  checkSettingCompatibility,
  compareEngineVersions,
  parseEngineVersion,
  SETTING_COMPATIBILITY_CODES,
  SettingCompatibilityError,
} from '../../src/engine/settings/settingCompatibility.js';
import { installSettingPackage } from '../../src/engine/settings/settingPackageInstaller';
import { openSettingPackageRuntime } from '../../src/engine/settings/settingPackageRuntime';

const baseManifest = (overrides = {}) => ({
  id: 'custom_setting',
  name: 'Custom Setting',
  version: '1.0.0',
  requiresCore: '>=1.0',
  defaultLocale: 'en-EN',
  locales: ['en-EN'],
  ...overrides,
});

const codes = (problems) => problems.map((problem) => problem.code);

describe('setting compatibility: versions', () => {
  it('parses and compares engine versions', () => {
    expect(parseEngineVersion('1.0.1')).toEqual([1, 0, 1]);
    expect(parseEngineVersion('v1.2')).toEqual([1, 2, 0]);
    expect(parseEngineVersion('nightly')).toBeNull();
    expect(compareEngineVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareEngineVersions('1.10.0', '1.2.0')).toBe(1);
    expect(compareEngineVersions('1.0', '1.0.0')).toBe(0);
  });

  it('accepts a package whose range covers the engine', () => {
    const problems = checkSettingCompatibility({
      manifest: baseManifest({ compatibility: { minimum: '1.0.0', maximum: '1.9.9' } }),
      engineVersion: '1.0.1',
    });
    expect(problems).toEqual([]);
  });

  it('refuses a package that needs a newer engine', () => {
    const problems = checkSettingCompatibility({
      manifest: baseManifest({ compatibility: { minimum: '1.2.0' } }),
      engineVersion: '1.0.1',
    });
    expect(codes(problems)).toEqual([SETTING_COMPATIBILITY_CODES.ENGINE_TOO_OLD]);
    expect(problems[0].params).toEqual({ required: '1.2.0', actual: '1.0.1' });
  });

  it('refuses a package that targets an older engine generation', () => {
    const problems = checkSettingCompatibility({
      manifest: baseManifest({ compatibility: { minimum: '1.0.0', maximum: '1.0.0' } }),
      engineVersion: '1.1.0',
    });
    expect(codes(problems)).toEqual([SETTING_COMPATIBILITY_CODES.ENGINE_TOO_NEW]);
  });

  it('refuses an unreadable range instead of ignoring it', () => {
    const problems = checkSettingCompatibility({
      manifest: baseManifest({ compatibility: { minimum: 'soon' } }),
      engineVersion: '1.0.1',
    });
    expect(codes(problems)).toEqual([SETTING_COMPATIBILITY_CODES.INVALID_COMPATIBILITY]);
    expect(problems[0].params).toEqual({ fields: ['compatibility.minimum'] });
  });

  it('does not restrict a package without a compatibility block', () => {
    expect(checkSettingCompatibility({ manifest: baseManifest(), engineVersion: '9.9.9' })).toEqual([]);
  });
});

describe('setting compatibility: capabilities and host modules', () => {
  it('refuses capabilities this engine does not know', () => {
    const problems = checkSettingCompatibility({
      manifest: baseManifest({ capabilities: ['inventory', 'telepathy'] }),
    });
    expect(codes(problems)).toEqual([SETTING_COMPATIBILITY_CODES.UNKNOWN_CAPABILITIES]);
    expect(problems[0].params.capabilities).toEqual(['telepathy']);
  });

  it('refuses a package that needs host modules missing from this build', () => {
    const problems = checkSettingCompatibility({
      manifest: baseManifest({ hostModules: ['engine:domain/perks', 'engine:domain/telepathy'] }),
      hostModuleIds: ['engine:domain/perks', 'react'],
    });
    expect(codes(problems)).toEqual([SETTING_COMPATIBILITY_CODES.MISSING_HOST_MODULES]);
    expect(problems[0].params.modules).toEqual(['engine:domain/telepathy']);
  });

  it('checks the declared runtime API', () => {
    expect(checkRuntimeApi({ runtime: { apiVersion: 1 } }, 1)).toEqual([]);
    expect(codes(checkRuntimeApi({ runtime: { apiVersion: 2 } }, 1)))
      .toEqual([SETTING_COMPATIBILITY_CODES.UNSUPPORTED_RUNTIME_API]);
  });

  it('requires declared services to be implemented', () => {
    const problems = checkDeclaredServices({
      manifest: baseManifest({ capabilities: ['inventory', 'perks', 'damage'] }),
      services: { inventory: {} },
    });
    // damage — требование к движку, а не сервис сеттинга.
    expect(problems).toEqual([{
      code: SETTING_COMPATIBILITY_CODES.MISSING_SERVICES,
      params: { services: ['perks'] },
    }]);
  });

  it('throws a typed error carrying every problem', () => {
    let error = null;
    try {
      assertSettingCompatibility({
        manifest: baseManifest({ compatibility: { minimum: '2.0.0' }, capabilities: ['telepathy'] }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SettingCompatibilityError);
    expect(error.code).toBe(SETTING_COMPATIBILITY_CODES.ENGINE_TOO_OLD);
    expect(codes(error.problems)).toHaveLength(2);
  });
});

const makeArchive = (overrides, bundleSource = 'module.exports = () => ({ id: "custom_setting", screens: [] });') => {
  const packed = {
    ...baseManifest(overrides),
    packFormat: 1,
    runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
    files: ['manifest.json', 'runtime/setting.cjs'],
  };
  return zipSync({
    'custom_setting/manifest.json': strToU8(JSON.stringify(packed)),
    'custom_setting/runtime/setting.cjs': strToU8(bundleSource),
  });
};

describe('setting compatibility is enforced before code runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to install a package for a newer engine', async () => {
    const bytes = makeArchive({
      compatibility: { minimum: '99.0.0' },
    });
    await expect(installSettingPackage({ name: 'custom.trpg', bytes }))
      .rejects.toMatchObject({ code: SETTING_COMPATIBILITY_CODES.ENGINE_TOO_OLD });
  });

  it('refuses to install a package with unknown capabilities', async () => {
    const bytes = makeArchive({ capabilities: ['telepathy'] });
    await expect(installSettingPackage({ name: 'custom.trpg', bytes }))
      .rejects.toMatchObject({ code: SETTING_COMPATIBILITY_CODES.UNKNOWN_CAPABILITIES });
  });

  it('does not execute the bundle of an incompatible package', async () => {
    const executed = vi.fn();
    globalThis.__settingBundleExecuted = executed;
    const bytes = makeArchive(
      { compatibility: { minimum: '99.0.0' } },
      'globalThis.__settingBundleExecuted(); module.exports = () => ({ id: "custom_setting", screens: [] });',
    );
    const installed = await installSettingPackage({ name: 'custom.trpg', bytes }).catch(() => null);
    expect(installed).toBeNull();

    // Даже минуя установщик, активация обязана отказать до `new Function`:
    // кэш возвращает ровно этот несовместимый пакет.
    const { readCachedSettingFile } = await import('../../src/engine/settings/settingPackageCache');
    readCachedSettingFile.mockImplementation(async (_key, name) => (
      name === 'manifest.json'
        ? strToU8(JSON.stringify({
          ...baseManifest({ compatibility: { minimum: '99.0.0' } }),
          packFormat: 1,
          runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
          files: ['manifest.json', 'runtime/setting.cjs'],
        }))
        : strToU8('globalThis.__settingBundleExecuted(); module.exports = () => ({ id: "custom_setting", screens: [] });')
    ));

    const runtime = await openSettingPackageRuntime(`custom_setting/${'0'.repeat(64)}`);
    await expect(runtime.loadModule({ modules: {} })).rejects.toMatchObject({
      code: SETTING_COMPATIBILITY_CODES.ENGINE_TOO_OLD,
    });
    expect(executed).not.toHaveBeenCalled();
  });

  it('keeps the current engine version available for the stand', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
