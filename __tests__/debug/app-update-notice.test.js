// ПРИЁМОЧНЫЙ (патч 335): окно «Что нового» — один раз на РЕЛИЗ.
// Слово владельца: «поле с галочкой убрать, показывать один раз в релиз.
// Релиз может состоять из кучи патчей» — патчи между релизами окно не
// показывают, notes в version.json описывают РЕЛИЗ, а не последний патч.
// Правило 321 сохранено: version = номер последнего патча, файл обновляется
// каждым патчем; release поднимает владелец.
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

describe('Окно «Что нового» (335): один раз на релиз, без галочки', () => {
  it('version.json: version = патч (растёт), release задан, notes = описание релиза', () => {
    expect(String(versionJson.version)).toMatch(/^\d+$/);
    expect(Number(versionJson.version)).toBeGreaterThanOrEqual(335);
    expect(versionJson.release, 'релиз объявлен в version.json').toBeTruthy();
    expect(versionJson.notes['ru-RU'].length).toBeGreaterThan(0);
    expect(versionJson.notes['en-EN'].length).toBeGreaterThan(0);
  });

  it('галочки больше нет: показывать только незнакомый релиз', () => {
    expect(shouldShowUpdateNotice(null, null)).toBe(false);
    expect(shouldShowUpdateNotice('1', '1')).toBe(false); // релиз уже показывали
    expect(shouldShowUpdateNotice('1', null)).toBe(true);
    expect(shouldShowUpdateNotice('2', '1')).toBe(true); // новый релиз — показываем
    // патчи между релизами: release тот же — окно молчит
    expect(shouldShowUpdateNotice('1', '1')).toBe(false);
  });

  it('память устройства: записали релиз — прочитали тот же', () => {
    const storage = memoryStorage();
    expect(readAckedVersion(storage)).toBeNull();
    writeAckedVersion(storage, '1');
    expect(readAckedVersion(storage)).toBe('1');
    expect(readAckedVersion(storage)).not.toBe('2');
  });

  it('ключ хранилища стабилен (смена ключа = окно всем заново)', () => {
    expect(ACK_STORAGE_KEY).toBe('app_version_ack');
  });

  it('выкачка version.json: release читается, без поля — фолбэк на патч', async () => {
    const ok = await fetchLatestVersion(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '335', release: '1', notes: { 'ru-RU': ['а'] } }),
    }));
    expect(ok).toEqual({ version: '335', release: '1', notes: { 'ru-RU': ['а'] } });

    // старое развёртывание без release: релиз = версия (поведение 321)
    const legacy = await fetchLatestVersion(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '321', notes: { 'ru-RU': ['а'] } }),
    }));
    expect(legacy).toEqual({ version: '321', release: '321', notes: { 'ru-RU': ['а'] } });

    await expect(fetchLatestVersion(vi.fn().mockResolvedValue({ ok: false }))).resolves.toBeNull();
    await expect(fetchLatestVersion(vi.fn().mockRejectedValue(new Error('offline')))).resolves.toBeNull();
    await expect(fetchLatestVersion(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('bad json'); },
    }))).resolves.toBeNull();
  });

  it('описание релиза: язык приложения, фолбэк на ru, пустые notes', () => {
    expect(notesForLocale(versionJson.notes, 'ru-RU')).toEqual(versionJson.notes['ru-RU']);
    expect(notesForLocale(versionJson.notes, 'en-EN')).toEqual(versionJson.notes['en-EN']);
    expect(notesForLocale({ 'ru-RU': ['а'] }, 'en-EN')).toEqual(['а']);
    expect(notesForLocale({}, 'ru-RU')).toEqual([]);
  });

  it('галочка «больше не показывать» удалена из словарей и модалки', () => {
    const ru = require('fs').readFileSync(
      new URL('../../i18n/ru-RU/App.json', import.meta.url),
      'utf-8',
    );
    expect(ru).not.toContain('dontShow');
    const modal = require('fs').readFileSync(
      new URL('../../components/UpdateNotice/UpdateNoticeModal.js', import.meta.url),
      'utf-8',
    );
    expect(modal).not.toContain('dontShow');
    expect(modal).not.toContain('MaterialCommunityIcons');
    // закрытие окна запоминает релиз (автоматический ack)
    expect(modal).toContain('writeAckedVersion(storage(), notice.release)');
  });

  it('окно смонтировано в приложении (проводка, урок патча 319)', () => {
    const app = require('fs').readFileSync(
      new URL('../../App.js', import.meta.url),
      'utf-8',
    );
    expect(app).toContain('<UpdateNoticeModal />');
  });
});
