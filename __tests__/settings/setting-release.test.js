// Обновление сеттинга по сети (слово владельца 2026-10-20): сеттинг смотрит
// в свой репозиторий и при запуске проверяет релиз. Здесь — правила:
// версии, requiresCore, разбор release.json, выбор решения и скачивание
// с проверкой размера/суммы. Сеть подменяется fetch-заглушкой.
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new Uint8Array(32).fill(0xab).buffer),
}));

import {
  compareVersions,
  normalizeReleaseSource,
  parseReleaseIndex,
  parseVersionRequirement,
  planSettingUpdate,
  releaseIndexUrl,
  satisfiesVersionRequirement,
  shouldCheckRelease,
} from '../../src/engine/settings/settingRelease';
import {
  downloadSettingRelease,
  fetchSettingReleaseIndex,
  settingReleaseDigest,
} from '../../src/engine/settings/settingReleaseClient';

const source = normalizeReleaseSource('fallout', {
  repository: 'rpg-companios/positronium-game-settings',
  branch: 'main',
  autoInstall: true,
});

const indexWith = (entry) => parseReleaseIndex({
  schemaVersion: 1,
  settings: { fallout: entry },
});

const releaseEntry = (overrides = {}) => ({
  id: 'fallout',
  name: 'Fallout 2d20',
  version: 2,
  packFormat: 1,
  requiresCore: '>=1.0',
  tag: 'fallout-v2',
  asset: 'fallout.trpg',
  assetUrl: 'https://github.com/rpg-companios/positronium-game-settings/releases/download/fallout-v2/fallout.trpg',
  latestUrl: 'https://github.com/rpg-companios/positronium-game-settings/releases/latest/download/fallout.trpg',
  bytes: 4,
  sha256: 'a'.repeat(64),
  ...overrides,
});

const fakeResponse = ({ ok = true, status = 200, json, bytes, headers = {} } = {}) => ({
  ok,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => json,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

describe('версии и requiresCore', () => {
  it('сравнение версий: числа, строки, разная длина', () => {
    expect(compareVersions(2, 1)).toBe(1);
    expect(compareVersions('1.2', '1.10')).toBe(-1);
    expect(compareVersions('1.0.0', '1')).toBe(0);
    expect(compareVersions('v2.3.4', '2.3.4')).toBe(0);
    expect(compareVersions('abc', 1)).toBeNull();
  });

  it('требования манифеста: >=, ^, ~, точное равенство', () => {
    expect(parseVersionRequirement('>=1.0')).toEqual({ operator: '>=', version: '1.0' });
    expect(parseVersionRequirement('*')).toEqual({ operator: '*', version: '0' });
    expect(parseVersionRequirement('сломано')).toBeNull();

    expect(satisfiesVersionRequirement('>=1.0', '1.0.0')).toBe(true);
    expect(satisfiesVersionRequirement('>=1.2', '1.1.9')).toBe(false);
    expect(satisfiesVersionRequirement('^1.2', '1.9.0')).toBe(true);
    expect(satisfiesVersionRequirement('^1.2', '2.0.0')).toBe(false);
    expect(satisfiesVersionRequirement('~1.2.3', '1.2.9')).toBe(true);
    expect(satisfiesVersionRequirement('~1.2.3', '1.3.0')).toBe(false);
    expect(satisfiesVersionRequirement('=2.0.0', '2.0.0')).toBe(true);
    // Чужой формат требования — не «совместимо по умолчанию».
    expect(satisfiesVersionRequirement('совместимо', '1.0.0')).toBe(false);
  });
});

describe('release.json', () => {
  it('адрес индекса — raw.githubusercontent, без GitHub API и токена', () => {
    expect(releaseIndexUrl(source)).toBe(
      'https://raw.githubusercontent.com/rpg-companios/positronium-game-settings/main/release.json',
    );
  });

  it('чужой/битый формат — явная ошибка, а не «обновлений нет»', () => {
    expect(() => parseReleaseIndex({ schemaVersion: 2, settings: {} })).toThrow(/schema/);
    expect(() => parseReleaseIndex(null)).toThrow(/object/);
  });

  it('источник без репозитория или с кривым id отвергается', () => {
    expect(() => normalizeReleaseSource('bad id', { repository: 'a/b' })).toThrow(/invalid setting id/);
    expect(() => normalizeReleaseSource('fallout', {})).toThrow(/invalid repository/);
  });
});

describe('решение об обновлении', () => {
  const plan = (entry, installedVersion = 1, coreVersion = '1.0.0') => planSettingUpdate({
    settingId: 'fallout',
    source,
    index: indexWith(entry),
    installedVersion,
    coreVersion,
  });

  it('новая версия → update-available с адресом архива', () => {
    const result = plan(releaseEntry());
    expect(result.status).toBe('update-available');
    expect(result.toVersion).toBe(2);
    expect(result.release.asset).toBe('fallout.trpg');
  });

  it('та же или старая версия → up-to-date', () => {
    expect(plan(releaseEntry({ version: 1 })).status).toBe('up-to-date');
    expect(plan(releaseEntry({ version: 1 }), 5).status).toBe('up-to-date');
  });

  it('пакет требует более новый движок → incompatible-core, обновление не предлагается', () => {
    const result = plan(releaseEntry({ requiresCore: '>=2.0' }), 1, '1.4.0');
    expect(result.status).toBe('incompatible-core');
    expect(result.reason).toMatch(/requires core/);
  });

  it('записи нет или она битая → not-released (клиент сообщает, а не молчит)', () => {
    expect(planSettingUpdate({
      settingId: 'fallout',
      source,
      index: parseReleaseIndex({ schemaVersion: 1, settings: {} }),
      installedVersion: 1,
      coreVersion: '1.0.0',
    }).status).toBe('not-released');
    expect(plan(releaseEntry({ asset: 'fallout.zip' })).status).toBe('not-released');
    expect(plan(releaseEntry({ assetUrl: 'http://insecure/fallout.trpg' })).status).toBe('not-released');
  });

  it('интервал проверки: не чаще 6 часов, force игнорирует интервал', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(shouldCheckRelease({ lastCheckedAt: 0, now })).toBe(true);
    expect(shouldCheckRelease({
      lastCheckedAt: now - 60 * 60 * 1000,
      now,
      intervalHours: 6,
    })).toBe(false);
    expect(shouldCheckRelease({
      lastCheckedAt: now - 60 * 60 * 1000,
      now,
      intervalHours: 6,
      force: true,
    })).toBe(true);
  });
});

describe('скачивание релиза', () => {
  it('индекс читается с release.json и разбирается', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({
      json: { schemaVersion: 1, settings: { fallout: releaseEntry() } },
    }));
    const { index, url } = await fetchSettingReleaseIndex({ source, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(releaseIndexUrl(source), expect.any(Object));
    expect(url).toBe(releaseIndexUrl(source));
    expect(index.settings.fallout.version).toBe(2);
  });

  it('ошибка HTTP — исключение с адресом (не тихий ноль)', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ ok: false, status: 404 }));
    await expect(fetchSettingReleaseIndex({ source, fetchImpl })).rejects.toThrow(/HTTP 404/);
  });

  it('скачивается первый рабочий адрес; размер сверяется с релизом', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(async () => fakeResponse({ bytes }));
    const { bytes: downloaded, name } = await downloadSettingRelease({
      release: { ...releaseEntry({ bytes: 4 }), assetUrl: 'https://example.test/fallout.trpg' },
      fetchImpl,
    });
    expect(Array.from(downloaded)).toEqual([1, 2, 3, 4]);
    expect(name).toBe('fallout.trpg');
  });

  it('несовпадение размера — отказ: битый архив не ставим', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async () => fakeResponse({ bytes }));
    await expect(downloadSettingRelease({
      release: { ...releaseEntry({ bytes: 4 }), assetUrl: 'https://example.test/fallout.trpg' },
      fetchImpl,
    })).rejects.toThrow(/does not match/);
  });

  it('сумма считается через expo-crypto (заглушка даёт 32 байта 0xab)', async () => {
    await expect(settingReleaseDigest(new Uint8Array([1]))).resolves.toBe('ab'.repeat(32));
  });
});
