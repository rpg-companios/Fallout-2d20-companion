import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  parseSettingPackageArchive,
  SETTING_PACKAGE_MAX_FILE_BYTES,
} from '../../src/engine/settings/settingPackageArchive';

const makeArchive = ({
  id = 'sample_setting',
  fileContents = { 'data/rules.json': '{"rules":[]}', 'screens/custom.js': 'export const custom = true;' },
  extraFiles = {},
  manifestOverrides = {},
} = {}) => {
  const manifest = {
    id,
    name: 'Sample Setting',
    version: '1.0.0',
    requiresCore: '>=1.0',
    defaultLocale: 'en-EN',
    locales: ['en-EN'],
    packFormat: 1,
    files: ['manifest.json', ...Object.keys(fileContents)],
    ...manifestOverrides,
  };
  const zipContents = {
    [`${id}/manifest.json`]: strToU8(JSON.stringify(manifest)),
    ...Object.fromEntries(Object.entries(fileContents).map(([path, body]) => [
      `${id}/${path}`,
      typeof body === 'string' ? strToU8(body) : body,
    ])),
    ...Object.fromEntries(Object.entries(extraFiles).map(([path, body]) => [
      path,
      typeof body === 'string' ? strToU8(body) : body,
    ])),
  };
  return { manifest, archive: zipSync(zipContents) };
};

describe('setting package archive', () => {
  it('validates the wallet and returns only files declared by its manifest', () => {
    const { manifest, archive } = makeArchive({
      extraFiles: { 'sample_setting/not-used.txt': 'must remain unextracted' },
    });
    const parsed = parseSettingPackageArchive(archive);

    expect(parsed.rootFolder).toBe(manifest.id);
    expect(parsed.manifest).toMatchObject({ id: manifest.id, version: manifest.version, packFormat: 1 });
    expect(parsed.files.map((file) => file.path)).toEqual(manifest.files);
    expect(parsed.files.find((file) => file.path === 'screens/custom.js')?.bytes)
      .toEqual(strToU8('export const custom = true;'));
    expect(parsed.files.some((file) => file.path === 'not-used.txt')).toBe(false);
  });

  it('rejects manifest id mismatches and missing declared files', () => {
    const mismatch = makeArchive({
      id: 'sample_setting',
      manifestOverrides: { id: 'other_setting' },
    });
    expect(() => parseSettingPackageArchive(mismatch.archive)).toThrow(/does not match archive folder/);

    // Keep a declaration for a file that is absent from the zip.
    const manifest = {
      id: 'sample_setting',
      name: 'Sample Setting',
      version: '1.0.0',
      requiresCore: '>=1.0',
      defaultLocale: 'en-EN',
      locales: ['en-EN'],
      packFormat: 1,
      files: ['manifest.json', 'data/rules.json', 'data/absent.json'],
    };
    const archive = zipSync({
      'sample_setting/manifest.json': strToU8(JSON.stringify(manifest)),
      'sample_setting/data/rules.json': strToU8('{}'),
    });
    expect(() => parseSettingPackageArchive(archive)).toThrow(/declared file is missing/);
  });

  it('rejects unsafe archive names before extracting content', () => {
    const { archive } = makeArchive({
      extraFiles: { '../outside.txt': 'nope' },
    });
    expect(() => parseSettingPackageArchive(archive)).toThrow(/unsafe archive path/);
  });

  it('rejects a package file whose declared uncompressed size exceeds the cap', () => {
    const tooLarge = new Uint8Array(SETTING_PACKAGE_MAX_FILE_BYTES + 1);
    const { archive } = makeArchive({ fileContents: { 'data/large.bin': tooLarge } });
    expect(() => parseSettingPackageArchive(archive)).toThrow(/file exceeds/);
  });

  it('rejects invalid archives and unsupported package formats', () => {
    expect(() => parseSettingPackageArchive(new Uint8Array([1, 2, 3]))).toThrow(/invalid ZIP archive/);
    const { archive } = makeArchive({ manifestOverrides: { packFormat: 2 } });
    expect(() => parseSettingPackageArchive(archive)).toThrow(/unsupported packFormat/);
  });
});
