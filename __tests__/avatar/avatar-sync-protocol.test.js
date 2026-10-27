// __tests__/avatar/avatar-sync-protocol.test.js
//
// Протокол редкого синка аватаров (components/cloudSync/avatarSync.js,
// задел патча 193; UI нет). Правила — docs/premium-and-avatar-design.md §1.2.

import { describe, it, expect } from 'vitest';
import {
  AVATARS_FOLDER_NAME,
  avatarFileName,
  characterIdFromAvatarFileName,
  decideAvatarAction,
  planAvatarSync,
  syncAvatars,
} from '../../components/cloudSync/avatarSync';

const makeLocal = (characterId, { md5 = null, updatedAt = 1000 } = {}) => ({ characterId, md5, updatedAt });
const makeRemote = (characterId, { fileId = 'f1', md5 = null, modifiedTime = 1000 } = {}) => ({
  fileId,
  name: avatarFileName(characterId),
  md5,
  modifiedTime,
});

describe('avatar sync: имена файлов', () => {
  it('папка называется avatars, файл — <characterId>.jpg', () => {
    expect(AVATARS_FOLDER_NAME).toBe('avatars');
    expect(avatarFileName('char_abc')).toBe('char_abc.jpg');
    expect(characterIdFromAvatarFileName('char_abc.jpg')).toBe('char_abc');
    expect(characterIdFromAvatarFileName('что-то-не-то.json')).toBeNull();
  });
});

describe('avatar sync: решение по одной паре копий', () => {
  it('нет локальной — качаем; нет облачной — грузим', () => {
    expect(decideAvatarAction({ local: null, remote: { md5: 'x', modifiedTime: 1 } })).toBe('download');
    expect(decideAvatarAction({ local: { md5: 'x', updatedAt: 1 }, remote: null })).toBe('upload');
  });

  it('md5 совпадает — ноль действий', () => {
    expect(decideAvatarAction({
      local: { md5: 'same', updatedAt: 1 },
      remote: { md5: 'same', modifiedTime: 999 },
    })).toBe('noop');
  });

  it('расхождение — last-write-wins по времени', () => {
    expect(decideAvatarAction({
      local: { md5: 'a', updatedAt: 2000 },
      remote: { md5: 'b', modifiedTime: 1000 },
    })).toBe('upload');
    expect(decideAvatarAction({
      local: { md5: 'a', updatedAt: 1000 },
      remote: { md5: 'b', modifiedTime: 2000 },
    })).toBe('download');
  });
});

describe('avatar sync: план синка', () => {
  it('локальная копия без облачной — выгрузка', () => {
    const plan = planAvatarSync({
      local: [makeLocal('c1', { md5: 'm1' })],
      remote: [],
      existingCharacterIds: ['c1'],
    });
    expect(plan.uploads).toEqual([{ characterId: 'c1', fileId: null }]);
    expect(plan.downloads).toEqual([]);
  });

  it('облачная без локальной — загрузка в кэш', () => {
    const plan = planAvatarSync({
      local: [],
      remote: [makeRemote('c1', { fileId: 'f9' })],
      existingCharacterIds: ['c1'],
    });
    expect(plan.downloads).toEqual([{ characterId: 'c1', fileId: 'f9' }]);
    expect(plan.uploads).toEqual([]);
  });

  it('md5 равны — noop, без запросов', () => {
    const plan = planAvatarSync({
      local: [makeLocal('c1', { md5: 'same' })],
      remote: [makeRemote('c1', { md5: 'same' })],
      existingCharacterIds: ['c1'],
    });
    expect(plan.noop).toEqual([{ characterId: 'c1' }]);
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });

  it('расхождение: новее локальная — выгрузка с PATCH по fileId', () => {
    const plan = planAvatarSync({
      local: [makeLocal('c1', { md5: 'local', updatedAt: 2000 })],
      remote: [makeRemote('c1', { fileId: 'f7', md5: 'remote', modifiedTime: 1000 })],
      existingCharacterIds: ['c1'],
    });
    expect(plan.uploads).toEqual([{ characterId: 'c1', fileId: 'f7' }]);
  });

  it('осиротевшие копии: персонажа нет — убрать и локально, и в облаке', () => {
    const plan = planAvatarSync({
      local: [makeLocal('dead-local')],
      remote: [makeRemote('dead-remote', { fileId: 'f5' })],
      existingCharacterIds: ['alive'],
    });
    expect(plan.localDeletes).toEqual([{ characterId: 'dead-local' }]);
    expect(plan.remoteDeletes).toEqual([{ characterId: 'dead-remote', fileId: 'f5' }]);
    // живому персонажу без аватаров ничего не планируется
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });
});

describe('avatar sync: оркестратор', () => {
  const makeDrive = () => {
    const calls = { list: 0, upload: [], download: [], delete: [], ensure: 0 };
    return {
      calls,
      driveOps: {
        listAvatarFiles: async () => { calls.list += 1; return []; },
        uploadAvatarFile: async (args) => { calls.upload.push(args); return { id: 'new-id', md5Checksum: 'drive-md5' }; },
        downloadAvatarFile: async (tokenArg, fileId) => { calls.download.push(fileId); return 'data:image/jpeg;base64,QUJD'; },
        deleteAvatarFile: async (fileId) => { calls.delete.push(fileId); },
      },
    };
  };

  const makeCache = (rows = []) => {
    const state = new Map(rows.map((r) => [r.character_id, r]));
    return {
      state,
      list: async () => Array.from(state.values()),
      get: async (id) => state.get(id) ?? null,
      setFromRemote: async (id, dataUrl, md5, updatedAt) => { state.set(id, { character_id: id, data_url: dataUrl, md5, updated_at: updatedAt }); },
      updateMd5: async (id, md5) => { state.set(id, { ...state.get(id), md5 }); },
      delete: async (id) => { state.delete(id); },
    };
  };

  it('пусто и локально, и в облаке — папка не создаётся, ни загрузок, ни выгрузок', async () => {
    const { calls, driveOps } = makeDrive();
    const stats = await syncAvatars({
      token: 't',
      driveOps,
      cacheOps: makeCache([]),
      listCharacterIds: async () => ['c1'],
      findFolder: async () => null,
      ensureFolder: async () => { calls.ensure += 1; return 'folder'; },
      validateDataUrl: (d) => validate(d),
    });
    expect(stats).toEqual({ uploaded: 0, downloaded: 0, noop: 0, localDeleted: 0, remoteDeleted: 0 });
    expect(calls.ensure).toBe(0);
    expect(calls.upload).toEqual([]);
    expect(calls.download).toEqual([]);
  });

  it('новое устройство: локальный кэш пуст, аватар из облака скачивается', async () => {
    const { calls, driveOps } = makeDrive();
    const driveWithFile = {
      ...driveOps,
      listAvatarFiles: async () => [{ id: 'f1', name: 'c1.jpg', md5Checksum: 'm1', modifiedTime: '2026-09-06T00:00:00.000Z' }],
    };
    const cache = makeCache([]);
    const stats = await syncAvatars({
      token: 't',
      driveOps: driveWithFile,
      cacheOps: cache,
      listCharacterIds: async () => ['c1'],
      findFolder: async () => 'folder-id',
      ensureFolder: async () => { throw new Error('не должна вызываться'); },
      validateDataUrl: (d) => validate(d),
    });
    expect(stats.downloaded).toBe(1);
    expect(cache.state.get('c1').md5).toBe('m1');
    expect(calls.upload).toEqual([]);
  });

  it('выгрузка: файл создаётся, md5 из Drive пишется в кэш', async () => {
    const { calls, driveOps } = makeDrive();
    const cache = makeCache([{ character_id: 'c1', data_url: 'data:image/jpeg;base64,QUJD', md5: null, updated_at: 2000 }]);
    const stats = await syncAvatars({
      token: 't',
      driveOps,
      cacheOps: cache,
      listCharacterIds: async () => ['c1'],
      ensureFolder: async () => 'folder-id',
      validateDataUrl: (d) => validate(d),
    });
    expect(stats.uploaded).toBe(1);
    expect(calls.upload[0]).toMatchObject({ characterId: 'c1', fileId: null, folderId: 'folder-id' });
    expect(cache.state.get('c1').md5).toBe('drive-md5');
  });

  it('загрузка: чужой аватар валидируется и кладётся в кэш с md5 облака', async () => {
    const { calls, driveOps } = makeDrive();
    const driveWithFile = {
      ...driveOps,
      listAvatarFiles: async () => [{ id: 'f3', name: 'c1.jpg', md5Checksum: 'cloud-md5', modifiedTime: '2026-09-06T00:00:00.000Z' }],
    };
    const cache = makeCache([]);
    const stats = await syncAvatars({
      token: 't',
      driveOps: driveWithFile,
      cacheOps: cache,
      listCharacterIds: async () => ['c1'],
      findFolder: async () => 'folder-id',
      ensureFolder: async () => 'folder-id',
      validateDataUrl: (d) => validate(d),
    });
    expect(stats.downloaded).toBe(1);
    expect(calls.download).toEqual(['f3']);
    const row = cache.state.get('c1');
    expect(row.md5).toBe('cloud-md5');
    expect(row.data_url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('«толстый» файл из облака в кэш не попадает', async () => {
    const { driveOps } = makeDrive();
    const driveWithBig = {
      ...driveOps,
      listAvatarFiles: async () => [{ id: 'f4', name: 'c1.jpg', md5Checksum: 'big', modifiedTime: '2026-09-06T00:00:00.000Z' }],
      downloadAvatarFile: async () => `data:image/jpeg;base64,${'A'.repeat(500000)}`,
    };
    const cache = makeCache([{ character_id: 'other', data_url: 'data:image/jpeg;base64,QUJD', md5: 'm', updated_at: 1 }]);
    const stats = await syncAvatars({
      token: 't',
      driveOps: driveWithBig,
      cacheOps: cache,
      listCharacterIds: async () => ['c1', 'other'],
      findFolder: async () => 'folder-id',
      ensureFolder: async () => 'folder-id',
      validateDataUrl: (d) => validate(d),
    });
    expect(stats.downloaded).toBe(1); // пытались
    expect(cache.state.get('c1')).toBeUndefined(); // но не положили
  });
});

// Локальный импорт валидатора, чтобы тесты не тянули домен отдельно
import { validateAvatarDataUrl as validateModule } from '../../domain/characterAvatar';
const validate = (d) => validateModule(d);
