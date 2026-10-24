// Отказ записи персонажа должен быть виден и назван.
//
// Было: `saveCharacter` ловил ЛЮБУЮ ошибку и молча возвращал null, а экран
// вызывал его без await и внутри try/catch, который ничего не ловил. Итог для
// человека — «ввёл имя, нажал «Сохранить», ничего не происходит». С тем же
// молчанием падали импорт .rpgc (там виноватым оказывался файл) и синхронизация.
//
// Стало: причина уходит в алерт и остаётся в getLastSaveError().
import { beforeEach, describe, expect, it, vi } from 'vitest';

const alerts = [];
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(async (payload) => { alerts.push(payload); }),
  showAlert: vi.fn(async () => null),
  confirmAlert: vi.fn(async () => false),
}));

const dbState = { failWith: null };
vi.mock('../../db', () => ({
  saveCharacter: vi.fn(async () => {
    if (dbState.failWith) throw dbState.failWith;
  }),
  loadCharacterById: vi.fn(async () => null),
  getCharactersList: vi.fn(async () => []),
  deleteCharacter: vi.fn(async () => {}),
  clearCharacterRenameRequest: vi.fn(async () => {}),
}));
vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn(async () => {}),
}));
vi.mock('../../db/Database', () => ({
  getWeaponById: vi.fn(async () => null),
  getWeaponModById: vi.fn(async () => null),
  getAmmoById: vi.fn(async () => null),
  getItemByName: vi.fn(async () => null),
  getCharactersList: vi.fn(async () => []),
}));

import { getLastSaveError, saveCharacter } from '../../src/saves/characterSaves';

describe('отказ сохранения персонажа виден человеку', () => {
  beforeEach(() => {
    alerts.length = 0;
    dbState.failWith = null;
  });

  it('успешная запись не показывает диалогов', async () => {
    const id = await saveCharacter('Поселенец');
    expect(typeof id).toBe('string');
    expect(alerts).toHaveLength(0);
    expect(getLastSaveError()).toBeNull();
  });

  it('отказ базы показывает причину, а не молчание', async () => {
    dbState.failWith = new Error('no such table: characters');
    const id = await saveCharacter('Поселенец');
    expect(id).toBeNull();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain('no such table: characters');
    // Язык берётся из настроек приложения — проверяем текст, а не локаль.
    expect(['Персонаж не сохранён', 'Character not saved']).toContain(alerts[0].title);
    expect(getLastSaveError()?.message).toBe('no such table: characters');
  });

  it('успешная запись после отказа сбрасывает прошлую причину', async () => {
    dbState.failWith = new Error('disk I/O error');
    await saveCharacter('Поселенец');
    dbState.failWith = null;
    await saveCharacter('Поселенец');
    expect(getLastSaveError()).toBeNull();
  });
});
