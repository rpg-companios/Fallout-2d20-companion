// Патч 212 — знание каталога в сейве персонажа.
//
// Требование владельца: сейв знает свой каталог; на устройстве без такого
// каталога он создаётся вне зависимости от настройки «каталоги персонажей»,
// и персонаж помещается внутрь. Слой БД (db/Database.js и Database.web.js) —
// тонкий клей над чистыми решениями domain/characterFolders.js, которые и
// покрыты здесь. Миграция v23→v24 идентична: поле опциональное,
// преобразований нет.

import { describe, expect, it } from 'vitest';
import {
  isValidFolderReference,
  overlayFolderOnSaveData,
  planFolderReconcile,
  stampFolderOnSaveData,
} from '../../domain/characterFolders';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const folderA = { id: 'folder_a', name: 'Рейдеры' };

describe('characterFolders: валидность ссылки на каталог', () => {
  it('id и имя — непустые строки', () => {
    expect(isValidFolderReference(folderA)).toBe(true);
    expect(isValidFolderReference({ id: 'x', name: ' ' })).toBe(false);
    expect(isValidFolderReference({ id: '', name: 'Имя' })).toBe(false);
    expect(isValidFolderReference({ id: 7, name: 'Имя' })).toBe(false);
    expect(isValidFolderReference(null)).toBe(false);
    expect(isValidFolderReference(undefined)).toBe(false);
    expect(isValidFolderReference('folder_a')).toBe(false);
  });
});

describe('characterFolders: штамп каталога в данные сейва', () => {
  it('каталог ставится, null/отсутствие — снимают поле', () => {
    const withFolder = stampFolderOnSaveData({ name: 'Курьер' }, folderA);
    expect(withFolder).toEqual({ name: 'Курьер', folder: { id: 'folder_a', name: 'Рейдеры' } });

    const cleared = stampFolderOnSaveData(withFolder, null);
    expect(cleared).toEqual({ name: 'Курьер' });
    expect(Object.hasOwn(cleared, 'folder')).toBe(false);

    const untouched = stampFolderOnSaveData({ name: 'Курьер' }, undefined);
    expect(Object.hasOwn(untouched, 'folder')).toBe(false);
  });

  it('штамп не мутирует исходные данные', () => {
    const data = { name: 'Курьер' };
    stampFolderOnSaveData(data, folderA);
    expect(data).toEqual({ name: 'Курьер' });
  });
});

describe('characterFolders: решение сверки (planFolderReconcile)', () => {
  it('сейв несёт каталог, членства нет → создать и поместить', () => {
    expect(planFolderReconcile({ saveFolder: folderA, localFolderId: null })).toEqual({
      action: 'ensure',
      folder: folderA,
    });
  });

  it('сейв несёт каталог, членство другой каталог → привести к сейву', () => {
    expect(planFolderReconcile({ saveFolder: folderA, localFolderId: 'folder_b' })).toEqual({
      action: 'ensure',
      folder: folderA,
    });
  });

  it('сейв и членство совпадают → ничего', () => {
    expect(planFolderReconcile({ saveFolder: folderA, localFolderId: 'folder_a' })).toEqual({
      action: 'none',
    });
  });

  it('сейв без каталога → ничего (членство устройства остаётся правдой)', () => {
    expect(planFolderReconcile({ saveFolder: null, localFolderId: 'folder_b' })).toEqual({
      action: 'none',
    });
    expect(planFolderReconcile({ saveFolder: undefined, localFolderId: null })).toEqual({
      action: 'none',
    });
    expect(planFolderReconcile({ saveFolder: { id: '', name: 'x' }, localFolderId: null })).toEqual({
      action: 'none',
    });
  });
});

describe('characterFolders: наложение при записи (overlayFolderOnSaveData)', () => {
  it('членство есть → сейв штампуется членством', () => {
    const out = overlayFolderOnSaveData({
      data: { name: 'Курьер', folder: { id: 'old', name: 'Старый' } },
      localFolder: folderA,
    });
    expect(out.folder).toEqual(folderA);
  });

  it('членства нет → сейв не трогаем: знание из облака переживает импорт', () => {
    const data = { name: 'Курьер', folder: folderA };
    expect(overlayFolderOnSaveData({ data, localFolder: null })).toEqual(data);
    expect(overlayFolderOnSaveData({ data: { name: 'Курьер' }, localFolder: null })).toEqual({
      name: 'Курьер',
    });
  });
});

describe('characterFolders: схема v25 и миграция', () => {
  it('текущая версия схемы — 25', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(25);
  });

  it('миграция v23→v24 идентична: поле folder проходит без изменений', () => {
    const v23 = {
      schemaVersion: 23,
      characterName: 'Курьер',
      folder: { id: 'folder_a', name: 'Рейдеры' },
    };
    const out = migrateCharacterState(v23);
    expect(out.schemaVersion).toBe(25);
    expect(out.folder).toEqual({ id: 'folder_a', name: 'Рейдеры' });
    expect(out.characterName).toBe('Курьер');
  });

  it('старый сейв без folder мигрирует без поля (корневой список)', () => {
    const v23 = { schemaVersion: 23, characterName: 'Курьер' };
    const out = migrateCharacterState(v23);
    expect(out.schemaVersion).toBe(25);
    expect(Object.hasOwn(out, 'folder')).toBe(false);
  });

  it('сейв с folder: null остаётся null (явный корневой список)', () => {
    const v23 = { schemaVersion: 23, characterName: 'Курьер', folder: null };
    const out = migrateCharacterState(v23);
    expect(out.schemaVersion).toBe(25);
    expect(out.folder).toBeNull();
  });
});
