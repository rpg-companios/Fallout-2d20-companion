import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import {
  cacheSettingPackage,
  deleteCachedSettingPackage,
  readCachedSettingFile,
} from '../../src/engine/settings/settingPackageCache';
import {
  disposeSettingPackageModule,
  openSettingPackageRuntime,
} from '../../src/engine/settings/settingPackageRuntime';

const manifest = {
  id: 'sample_setting',
  name: 'Sample Setting',
  version: '1.0.0',
  files: ['manifest.json', 'data/rules.json'],
};
const digest = 'a'.repeat(64);
const files = [
  { path: 'manifest.json', bytes: new TextEncoder().encode('{"id":"sample_setting"}') },
  { path: 'data/rules.json', bytes: new Uint8Array([1, 2, 3]) },
];

describe('setting package web cache', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('stores and reads the complete file wallet by safe relative path', async () => {
    const cacheKey = await cacheSettingPackage({ manifest, digest, files });

    expect(cacheKey).toBe(`sample_setting/${digest}`);
    expect(await readCachedSettingFile(cacheKey, 'manifest.json')).toEqual(files[0].bytes);
    expect(await readCachedSettingFile(cacheKey, 'data/rules.json')).toEqual(files[1].bytes);
    expect(await readCachedSettingFile(cacheKey, 'data/missing.json')).toBeNull();
  });

  it('overwrites identical content keys and deletes only the selected package cache', async () => {
    const cacheKey = await cacheSettingPackage({ manifest, digest, files });
    await cacheSettingPackage({
      manifest,
      digest,
      files: [{ ...files[1], bytes: new Uint8Array([9]) }, files[0]],
    });

    expect(await readCachedSettingFile(cacheKey, 'data/rules.json')).toEqual(new Uint8Array([9]));
    await deleteCachedSettingPackage(cacheKey);
    expect(await readCachedSettingFile(cacheKey, 'manifest.json')).toBeNull();
  });

  it('rejects traversal paths and malformed cache keys', async () => {
    await expect(readCachedSettingFile(`sample_setting/${digest}`, '../outside.txt'))
      .rejects.toThrow(/safe relative file path/);
    await expect(deleteCachedSettingPackage('sample_setting/../../outside'))
      .rejects.toThrow(/invalid cache key/);
    await expect(cacheSettingPackage({
      manifest,
      digest,
      files: [files[0], { path: '../outside.txt', bytes: new Uint8Array([4]) }],
    })).rejects.toThrow(/invalid or duplicate wallet file/);
  });

  it('opens a cached wallet as allowlisted JSON/byte data without evaluating code', async () => {
    const runtimeManifest = {
      id: 'sample_setting',
      name: 'Sample Setting',
      version: '2.0.0',
      requiresCore: '>=1.0',
      defaultLocale: 'en-EN',
      locales: ['en-EN'],
      packFormat: 1,
      runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
      files: [
        'manifest.json',
        'data/rules.json',
        'data/broken.json',
        'scripts/mechanic.js',
        'assets/logo.png',
        'runtime/setting.cjs',
      ],
    };
    const assetModuleId = 'setting-asset:assets/logo.png';
    const requireAsset = `require(${JSON.stringify(assetModuleId)})`;
    const runtimeFiles = [
      { path: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(runtimeManifest)) },
      { path: 'data/rules.json', bytes: new TextEncoder().encode('{"rules":["safe"]}') },
      { path: 'data/broken.json', bytes: new TextEncoder().encode('{ broken json') },
      { path: 'scripts/mechanic.js', bytes: new TextEncoder().encode('globalThis.packageCodeExecuted = true;') },
      { path: 'assets/logo.png', bytes: new Uint8Array([137, 80, 78, 71]) },
      {
        path: 'runtime/setting.cjs',
        bytes: new TextEncoder().encode(
          `const logo = ${requireAsset}; const shared = require("engine:example/shared"); module.exports = (engineApi) => { engineApi.activations.push("fallout"); return { id: engineApi.settingId, screens: ["character"], mechanics: ["combat"], asset: logo, availableAsset: engineApi.modules[${JSON.stringify(assetModuleId)}], shared: shared.name, dispose: () => engineApi.disposals.push("fallout") }; };`,
        ),
      },
    ];
    const runtimeDigest = 'b'.repeat(64);
    const cacheKey = await cacheSettingPackage({
      manifest: runtimeManifest,
      digest: runtimeDigest,
      files: runtimeFiles,
    });
    const runtime = await openSettingPackageRuntime(cacheKey);
    const engineApi = {
      settingId: 'sample_setting',
      activations: [],
      disposals: [],
      modules: { 'engine:example/shared': { name: 'host-mechanic' } },
    };

    expect(runtime.manifest.id).toBe('sample_setting');
    expect(engineApi.activations).toEqual([]);
    expect(await runtime.readJson('data/rules.json')).toEqual({ rules: ['safe'] });
    expect(new TextDecoder().decode(await runtime.readBytes('scripts/mechanic.js')))
      .toBe('globalThis.packageCodeExecuted = true;');
    expect(globalThis.packageCodeExecuted).toBeUndefined();
    await expect(runtime.readJson('scripts/mechanic.js')).rejects.toThrow(/requires a .json file/);
    await expect(runtime.readJson('data/broken.json')).rejects.toThrow(/invalid JSON at data\/broken.json/);
    await expect(runtime.readBytes('private.json')).rejects.toThrow(/not declared in manifest.files/);
    const settingModule = await runtime.loadModule(engineApi);
    expect(engineApi.activations).toEqual(['fallout']);
    expect(settingModule).toMatchObject({
      id: 'sample_setting',
      screens: ['character'],
      mechanics: ['combat'],
      asset: { uri: expect.stringMatching(/^blob:/) },
      availableAsset: { uri: expect.stringMatching(/^blob:/) },
      shared: 'host-mechanic',
    });
    disposeSettingPackageModule(settingModule);
    expect(engineApi.disposals).toEqual(['fallout']);
  });
});
