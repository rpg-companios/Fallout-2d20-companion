// Приёмочный тест 509. Владелец: «Да сейв нужен мультиплатформенный. И ещё
// надо чтобы, что мастер, что игрок могли экспортировать общее хранилище в
// json ... если мастер перестанет вести игру или игроки поменяют мастера ...
// пришли в новый сервер и мастер наполнил хранилище одним действием».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStorageExportPayload,
  parseStorageImportPayload,
  storageExportFileName,
  STORAGE_EXPORT_TYPE,
} from '../../domain/partyStorageTransfer.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const SNAPSHOT = {
  revision: 6,
  entries: [
    { entryId: 'st_1', item: { id: 'w1', name: 'Пулемёт' }, name: 'Пулемёт', itemType: 'weapon', quantity: 2 },
    { entryId: 'st_2', item: { id: 'c1', name: 'Карточка' }, name: 'Карточка', itemType: 'misc', quantity: 1 },
  ],
};

describe('509: формат JSON-снимка', () => {
  it('экспорт содержит конверт, ревизию и записи', () => {
    const payload = createStorageExportPayload({ code: 'GM-ABC123', storage: SNAPSHOT, exportedBy: 'player' });
    expect(payload.type).toBe(STORAGE_EXPORT_TYPE);
    expect(payload.formatVersion).toBe(1);
    expect(payload.code).toBe('GM-ABC123');
    expect(payload.exportedBy).toBe('player');
    expect(payload.storage.entries).toHaveLength(2);
    expect(payload.storage.revision).toBe(6);
    expect(payload.exportedAt).toBeGreaterThan(0);
  });

  it('импорт читает и конверт, и «голый» снимок', () => {
    const payload = createStorageExportPayload({ code: 'GM-ABC123', storage: SNAPSHOT });
    const fromEnvelope = parseStorageImportPayload(JSON.stringify(payload));
    expect(fromEnvelope.error).toBeUndefined();
    expect(fromEnvelope.code).toBe('GM-ABC123');
    expect(fromEnvelope.storage.entries[0].quantity).toBe(2);

    const bare = parseStorageImportPayload({ revision: 3, entries: [SNAPSHOT.entries[1]] });
    expect(bare.error).toBeUndefined();
    expect(bare.storage.revision).toBe(3);
    expect(bare.storage.entries).toHaveLength(1);
  });

  it('битые файлы отклоняются, имя файла безопасное', () => {
    expect(parseStorageImportPayload('{oops').error).toBe('INVALID_JSON');
    expect(parseStorageImportPayload({ hello: 1 }).error).toBe('NO_ENTRIES');
    expect(parseStorageImportPayload(null).error).toBe('INVALID_JSON');
    const name = storageExportFileName('GM-АБ/В:Г', new Date('2026-11-03T10:00:00Z'));
    expect(name).toMatch(/^storage__[A-Za-z0-9_-]+__2026-11-03\.json$/);
    expect(name).not.toContain('А');
  });

  it('новый Мастер наполняет новый сервер одним импортом', () => {
    const exported = createStorageExportPayload({ code: 'GM-NEWROOM', storage: SNAPSHOT });
    const imported = parseStorageImportPayload(JSON.stringify(exported));
    // Имитация «пришли на новый сервер»: свежий реестр, пустая комната.
    const registry = createRoomRegistry({ now: () => 5000 });
    const { room } = registry.createRoom({ clientId: 'new-gm', name: 'Новая', ownerToken: 't' });
    registry.joinRoom({ code: room.code, clientId: 'new-gm', name: 'GM', role: 'gm' });
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(0);
    const restored = registry.restorePartyStorage({
      code: room.code, clientId: 'new-gm', ownerToken: 't', storage: imported.storage,
    });
    expect(restored.applied).toBe(true);
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(2);
    // Подключившийся игрок сразу видит наполненное хранилище.
    const joined = registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Игрок', role: 'player' });
    expect(joined.state.partyStorage.entries[0].name).toBe('Пулемёт');
  });
});

describe('509: мультиплатформенный сейв и UI', () => {
  it('Drive синхронизирует снимки в обе стороны', () => {
    const cloud = read('components/cloudSync/googleDriveSync.js');
    expect(cloud).toContain('syncRoomStoragesInSession');
    expect(cloud).toContain('parseRoomStorageCloudPayload');
    expect(cloud).toContain("startsWith('storage__')");
    expect(cloud).toContain('sync.roomStorages:done');
    expect(read('db/Database.js')).toContain('getAllRoomStorages');
    expect(read('db/Database.web.js')).toContain('getAllRoomStorages');
  });

  it('экспорт/импорт доступны и Мастеру, и игроку', () => {
    const modal = read('components/lootTrade/PartyStorageModal.js');
    expect(modal).toContain('testID="storage-export-button"');
    expect(modal).toContain('testID="storage-import-button"');
    expect(modal).toContain('saveCharacter');
    expect(modal).toContain('loadCharacter');
    expect(modal).toContain('room.role === \'gm\'');
    expect(modal).toContain('restorePartyStorage');
    expect(modal).toContain('saveRoomStorage');
    // Окно находится и для комнаты Мастера, не только игрока.
    expect(modal).toContain("value.role === 'player') || candidates[0]");
  });

  it('парные RU/EN подписи', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json')).storage;
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json')).storage;
    for (const key of ['export', 'import', 'exportDone', 'importDone', 'importError', 'importPlayerHint']) {
      expect(ru[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });
});
