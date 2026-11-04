// Приёмочный тест склада (патч 507 — каркас, патч 508 — слой хранения).
// Финальная модель владельца: «Общее хранилище это хранилище мастера +
// снапшот игрокам. Без мастера онлайн они не могут взять предметы ... но
// могут смотреть. Когда игрок подключается к комнате, происходит обновление
// хранилища на текущее состояние. Все изменения происходят пока игрок и
// мастер в сети».
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { MESSAGE, ERROR_CODE } from '../../server/protocol.js';
import { ROOM_MESSAGE, ROOM_ERROR } from '../../src/room/roomProtocol.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const ITEM = { id: 'w1', name: 'Пулемёт', itemType: 'weapon', weight: 12, cost: 300 };

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm-1', name: 'Стол', ownerToken: 'token-1' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Второй', role: 'player' });
  return { registry, room };
};

describe('508: хранилище Мастера + снапшот игрокам', () => {
  it('положить/забрать атомарно, ревизия растёт, снимок в room.state', () => {
    const { registry, room } = setup();
    const dep = registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 2 });
    expect(dep.error).toBeUndefined();
    expect(dep.storage.gmOnline).toBe(true);
    expect(dep.storage.revision).toBe(1);
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(1);
    const half = registry.withdrawFromPartyStorage({ code: room.code, clientId: 'p2', entryId: dep.entry.entryId, quantity: 1 });
    expect(half.withdrawn.quantity).toBe(1);
    expect(half.storage.entries[0].quantity).toBe(1);
    const rest = registry.withdrawFromPartyStorage({ code: room.code, clientId: 'p2', entryId: dep.entry.entryId, quantity: 99 });
    expect(rest.withdrawn.quantity).toBe(1);
    expect(rest.storage.entries).toHaveLength(0);
    expect(registry.withdrawFromPartyStorage({ code: room.code, clientId: 'p2', entryId: dep.entry.entryId }).error)
      .toBe(ERROR_CODE.STORAGE_ENTRY_NOT_FOUND);
  });

  it('без Мастера в сети — только чтение: снимок виден, запись запрещена', () => {
    const { registry, room } = setup();
    const dep = registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 1 });
    registry.leaveRoom({ code: room.code, clientId: 'gm-1' });
    const snapshot = registry.getState(room.code).partyStorage;
    expect(snapshot.gmOnline).toBe(false);
    expect(snapshot.entries).toHaveLength(1); // смотреть можно
    expect(registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 1 }).error)
      .toBe(ERROR_CODE.STORAGE_GM_OFFLINE);
    expect(registry.withdrawFromPartyStorage({ code: room.code, clientId: 'p1', entryId: dep.entry.entryId }).error)
      .toBe(ERROR_CODE.STORAGE_GM_OFFLINE);
  });

  it('Мастер поднимает своё сохранённое хранилище в комнату; игрок не может', () => {
    const { registry, room } = setup();
    const saved = { revision: 7, entries: [{ entryId: 'st_saved', item: ITEM, name: 'Пулемёт', itemType: 'weapon', quantity: 3 }] };
    expect(registry.restorePartyStorage({ code: room.code, clientId: 'p1', storage: saved }).error)
      .toBe(ERROR_CODE.NOT_ROOM_OWNER);
    const restored = registry.restorePartyStorage({ code: room.code, clientId: 'gm-1', storage: saved });
    expect(restored.applied).toBe(true);
    expect(registry.getState(room.code).partyStorage.entries[0].quantity).toBe(3);
    // Подключившийся игрок получает актуальный снимок вместе с room.state.
    const joined = registry.joinRoom({ code: room.code, clientId: 'p3', name: 'Третий', role: 'player' });
    expect(joined.state.partyStorage.entries[0].quantity).toBe(3);
    // Более старый сейв не откатывает комнату.
    expect(registry.restorePartyStorage({ code: room.code, clientId: 'gm-1', storage: { revision: 2, entries: [] } }).applied)
      .toBe(false);
  });

  it('Мастер не вносит и не забирает вещи (решение владельца, патч 518); игрок может', () => {
    const { registry, room } = setup();
    expect(registry.depositToPartyStorage({ code: room.code, clientId: 'gm-1', item: ITEM, quantity: 1 }).error)
      .toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    const dep = registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 1 });
    expect(dep.error).toBeUndefined();
    expect(registry.withdrawFromPartyStorage({ code: room.code, clientId: 'gm-1', entryId: dep.entry.entryId }).error)
      .toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    expect(registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: null, quantity: 1 }).error)
      .toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
  });

  it('сервер не пишет файлы: файлового store и .data/ больше нет', () => {
    expect(existsSync(path.join(ROOT, 'server/partyStorageStore.js'))).toBe(false);
    expect(read('.gitignore')).not.toContain('.data/');
    expect(read('server/start.js')).not.toContain('partyStorageStore');
    expect(read('server/roomRegistry.js')).not.toContain('persistStorages');
  });

  it('канон — локальная БД Мастера и его Drive', () => {
    expect(read('db/schema.js')).toContain('gm_room_storage');
    expect(read('src/lootTrade/partyStoragePersistence.js')).toContain('saveRoomStorage');
    expect(read('components/cloudSync/googleDriveSync.js')).toContain("type: 'gm_room_storage'");
    expect(read('App.js')).toContain('startPartyStoragePersistence');
    expect(read('App.js')).toContain('restoreMasterStorage');
  });
});

describe('508: протокол, словари и плашка', () => {
  it('константы зеркалятся в клиенте', () => {
    expect(ROOM_MESSAGE.STORAGE_STATE).toBe(MESSAGE.STORAGE_STATE);
    expect(ROOM_MESSAGE.STORAGE_DEPOSIT).toBe(MESSAGE.STORAGE_DEPOSIT);
    expect(ROOM_MESSAGE.STORAGE_WITHDRAW).toBe(MESSAGE.STORAGE_WITHDRAW);
    expect(ROOM_MESSAGE.STORAGE_RESTORE).toBe(MESSAGE.STORAGE_RESTORE);
    expect(ROOM_ERROR.STORAGE_GM_OFFLINE).toBe(ERROR_CODE.STORAGE_GM_OFFLINE);
  });

  it('плашка во всю ширину, название не настраивается, есть режим только чтения', () => {
    expect(read('components/screens/InventoryScreen/InventoryScreen.js')).toContain('testID="shared-storage-button"');
    expect(read('styles/InventoryScreen.styles.js')).toContain('sharedStorageCell');
    const modal = read('components/lootTrade/PartyStorageModal.js');
    expect(modal).toContain('gmOnline');
    expect(modal).toContain('screen.storage.readOnly');
    expect(modal).not.toContain('rename');
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json'));
    expect(ru.actions.sharedStorage).toBe('Общее хранилище');
    expect(en.actions.sharedStorage).toBe('Shared storage');
    expect(ru.storage.readOnly).toBeTruthy();
    expect(en.storage.readOnly).toBeTruthy();
  });

  it('клиент сохраняет и восстанавливает снимок Мастера', () => {
    const store = read('src/room/roomStore.ts');
    expect(store).toContain('onRoomStorageState');
    expect(store).toContain('restorePartyStorage');
    expect(read('src/lootTrade/partyStoragePersistence.js')).toContain('restoreMasterStorage');
  });
});
