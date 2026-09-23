// ПРИЁМОЧНЫЙ (патч 321): система обновлений PWA — окно «Что нового».
// Приложение читает /version.json свежим; версия новее запомненной → окно
// с чейнджлогом; галочка «больше не показывать» запоминает версию; без
// галочки окно появится снова. Файл version.json обновляется в том же
// патче, что и changelogs (версия = номер последнего патча).
import { describe, expect, it, vi } from 'vitest';

import {
  ACK_STORAGE_KEY,
  readAckedVersion,
  writeAckedVersion,
  shouldShowUpdateNotice,
  fetchLatestVersion,
  notesForLocale,
} from '../../src/utils/appVersion';
import versionJson from '../../public/version.json';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

describe('Система обновлений (321): version.json, окно «Что нового»', () => {
  it('version.json: версия — номер последнего патча, чейнджлог на обоих языках', () => {
    expect(versionJson.version).toBe('321');
    expect(versionJson.notes['ru-RU'].length).toBeGreaterThan(0);
    expect(versionJson.notes['en-EN'].length).toBeGreaterThan(0);
  });

  it('галочка «больше не показывать»: показывать только неизвестную версию', () => {
    expect(shouldShowUpdateNotice(null, null)).toBe(false);
    expect(shouldShowUpdateNotice('321', '321')).toBe(false);
    expect(shouldShowUpdateNotice('321', null)).toBe(true);
    expect(shouldShowUpdateNotice('321', '319')).toBe(true);
  });

  it('память устройства: записали версию — прочитали ту же', () => {
    const storage = memoryStorage();
    expect(readAckedVersion(storage)).toBeNull();
    writeAckedVersion(storage, '321');
    expect(readAckedVersion(storage)).toBe('321');
    expect(readAckedVersion(storage)).not.toBe('319');
  });

  it('ключ хранилища стабилен (смена ключа = окно всем заново)', () => {
    expect(ACK_STORAGE_KEY).toBe('app_version_ack');
  });

  it('выкачка version.json: успех, 404 и битый JSON не роняют приложение', async () => {
    const ok = await fetchLatestVersion(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '321', notes: { 'ru-RU': ['а'] } }),
    }));
    expect(ok).toEqual({ version: '321', notes: { 'ru-RU': ['а'] } });

    await expect(fetchLatestVersion(vi.fn().mockResolvedValue({ ok: false }))).resolves.toBeNull();
    await expect(fetchLatestVersion(vi.fn().mockRejectedValue(new Error('offline')))).resolves.toBeNull();
    await expect(fetchLatestVersion(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('bad json'); },
    }))).resolves.toBeNull();
  });

  it('чейнджлог: язык приложения, фолбэк на ru, пустые notes', () => {
    expect(notesForLocale(versionJson.notes, 'ru-RU')).toEqual(versionJson.notes['ru-RU']);
    expect(notesForLocale(versionJson.notes, 'en-EN')).toEqual(versionJson.notes['en-EN']);
    expect(notesForLocale({ 'ru-RU': ['а'] }, 'en-EN')).toEqual(['а']);
    expect(notesForLocale({}, 'ru-RU')).toEqual([]);
  });

  it('окно смонтировано в приложении (проводка, урок патча 319)', () => {
    const app = require('fs').readFileSync(
      new URL('../../App.js', import.meta.url),
      'utf-8',
    );
    expect(app).toContain('<UpdateNoticeModal />');
  });
});
