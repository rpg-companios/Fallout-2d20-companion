import { describe, expect, it } from 'vitest';
import {
  isSafeSettingPackagePath,
  validateSettingManifest,
  validateSettingPackageManifest,
} from '../../src/engine/contracts/settingManifest';

const baseManifest = () => ({
  id: 'fallout',
  name: 'Fallout 2d20',
  version: 1,
  requiresCore: '>=1.0',
  defaultLocale: 'ru-RU',
  locales: ['ru-RU', 'en-EN'],
});

describe('setting manifest contract', () => {
  it('accepts bundled metadata without archive-only fields', () => {
    const manifest = validateSettingManifest(baseManifest());
    expect(manifest.id).toBe('fallout');
    expect(manifest.defaultLocale).toBe('ru-RU');
    expect(manifest.locales).toEqual(['ru-RU', 'en-EN']);
    expect(manifest.packFormat).toBeUndefined();
  });

  it('preserves package extension metadata while validating shared fields', () => {
    const source = { ...baseManifest(), categories: { weapons: 'data/weapons.json' } };
    expect(validateSettingManifest(source).categories).toEqual(source.categories);
  });

  it('rejects unsafe IDs, duplicate locales, and a missing default locale', () => {
    expect(() => validateSettingManifest({ ...baseManifest(), id: '../fallout' }))
      .toThrow(/id must be an ASCII identifier/);
    expect(() => validateSettingManifest({ ...baseManifest(), locales: ['ru-RU', 'ru-RU'] }))
      .toThrow(/locales must not contain duplicates/);
    expect(() => validateSettingManifest({ ...baseManifest(), defaultLocale: 'de-DE' }))
      .toThrow(/defaultLocale must be included in locales/);
  });

  it('validates the runtime entry descriptor and requires its bundle in the package allowlist', () => {
    const manifest = validateSettingPackageManifest({
      ...baseManifest(),
      packFormat: 1,
      runtime: { apiVersion: 1, source: 'runtimeEntry.js', entry: 'runtime/setting.cjs' },
      files: ['manifest.json', 'runtimeEntry.js', 'runtime/setting.cjs'],
    });
    expect(manifest.runtime).toEqual({
      apiVersion: 1,
      source: 'runtimeEntry.js',
      entry: 'runtime/setting.cjs',
    });
    expect(() => validateSettingPackageManifest({
      ...baseManifest(),
      packFormat: 1,
      runtime: { apiVersion: 1, entry: 'runtime/missing.cjs' },
      files: ['manifest.json'],
    })).toThrow(/runtime.entry must be declared in manifest.files/);
    expect(() => validateSettingPackageManifest({
      ...baseManifest(),
      packFormat: 1,
      runtime: { apiVersion: 1, source: 'runtimeEntry.js', entry: 'runtime/setting.cjs' },
      files: ['manifest.json', 'runtime/setting.cjs'],
    })).toThrow(/runtime.source must be declared in manifest.files/);
    expect(() => validateSettingManifest({
      ...baseManifest(),
      runtime: { apiVersion: 1, source: '../runtimeEntry.js', entry: 'runtime/setting.cjs' },
    })).toThrow(/runtime.source must be a safe relative package path/);
    expect(() => validateSettingManifest({
      ...baseManifest(),
      runtime: { apiVersion: 0, entry: 'runtime/setting.cjs' },
    })).toThrow(/runtime.apiVersion must be a positive integer/);
    expect(() => validateSettingManifest({
      ...baseManifest(),
      runtime: { apiVersion: 1, entry: '../outside.cjs' },
    })).toThrow(/runtime.entry must be a safe relative package path/);
  });

  it('validates a packaged manifest and requires its own manifest file', () => {
    const manifest = validateSettingPackageManifest({
      ...baseManifest(),
      packFormat: 1,
      files: ['manifest.json', 'data/weapons.json'],
    });
    expect(manifest.packFormat).toBe(1);
    expect(manifest.files).toEqual(['manifest.json', 'data/weapons.json']);

    expect(() => validateSettingPackageManifest(baseManifest()))
      .toThrow(/requires a positive integer packFormat/);
    expect(() => validateSettingPackageManifest({
      ...baseManifest(),
      packFormat: 1,
      files: ['data/weapons.json'],
    })).toThrow(/must include manifest.json/);
  });

  it('rejects traversal, duplicate, and file/directory-collision paths', () => {
    const packaged = (files) => ({ ...baseManifest(), packFormat: 1, files });
    expect(() => validateSettingPackageManifest(packaged(['manifest.json', '../outside.json'])))
      .toThrow(/unsafe package path/);
    expect(() => validateSettingPackageManifest(packaged(['manifest.json', 'data/items.json', 'data/items.json'])))
      .toThrow(/duplicate package path/);
    expect(() => validateSettingPackageManifest(packaged(['manifest.json', 'data', 'data/items.json'])))
      .toThrow(/also used as a directory/);
  });

  it('recognizes only canonical relative POSIX paths', () => {
    expect(isSafeSettingPackagePath('data/weapons.json')).toBe(true);
    for (const path of ['', '/absolute.json', '../outside.json', 'data/../outside.json', 'data\\weapons.json', 'C:/outside.json']) {
      expect(isSafeSettingPackagePath(path), path).toBe(false);
    }
  });
});
