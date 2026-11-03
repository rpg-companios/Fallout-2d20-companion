// Приёмочный тест 507, шаг 1 дизайна: «Общее хранилище» комнаты.
// Владелец: «Групповой склад ... общий контейнер куда каждый может что-то
// положить или забрать ... игрока сегодня нет, он придёт и достанет ...
// хранилище лучше на сервере. Подключился — получил обновления ...
// Имя настраивать не надо. Это просто "общее хранилище"».
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { createFilePartyStorageStore } from '../../server/partyStorageStore.js';
import { MESSAGE, ERROR_CODE } from '../../server/protocol.js';
import { ROOM_MESSAGE, ROOM_ERROR } from '../../src/room/roomProtocol.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const ITEM = { id: 'w1', name: 'Пулемёт', itemType: 'weapon', weight: 12, cost: 300 };

const setup = (extra = {}) => {
  const registry = createRoomRegistry({ now: () => 1000, ...extra });
  const { room } = registry.createRoom({ clientId: 'gm-1', name: 'Стол' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Второй', role: 'player' });
  return { registry, room };
};

describe('507: общее хранилище на сервере', () => {
  it('положить/забрать атомарно, ревизия растёт, снимок уходит в room.state', () => {
    const { registry, room } = setup();
    const dep = registry.depositToPartyStorage({
      code: room.code, clientId: 'p1', item: ITEM, quantity: 2,
    });
    expect(dep.error).toBeUndefined();
    expect(dep.entry.name).toBe('Пулемёт');
    expect(dep.entry.quantity).toBe(2);
    expect(dep.storage.revision).toBe(1);
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(1);

    const half = registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'p2', entryId: dep.entry.entryId, quantity: 1,
    });
    expect(half.withdrawn.quantity).toBe(1);
    expect(half.storage.entries[0].quantity).toBe(1);
    expect(half.storage.revision).toBe(2);

    const rest = registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'p2', entryId: dep.entry.entryId, quantity: 99,
    });
    expect(rest.withdrawn.quantity).toBe(1);
    expect(rest.storage.entries).toHaveLength(0);
    expect(registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'p2', entryId: dep.entry.entryId,
    }).error).toBe(ERROR_CODE.STORAGE_ENTRY_NOT_FOUND);
  });

  it('Мастер может положить, но не может забрать чужое', () => {
    const { registry, room } = setup();
    const dep = registry.depositToPartyStorage({
      code: room.code, clientId: 'gm-1', item: ITEM, quantity: 1,
    });
    expect(dep.error).toBeUndefined();
    expect(registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'gm-1', entryId: dep.entry.entryId,
    }).error).toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(1);
  });

  it('плохие данные и чужая комната отклоняются', () => {
    const { registry, room } = setup();
    expect(registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: null, quantity: 1 }).error)
      .toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
    expect(registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: -5 }).error)
      .toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
    expect(registry.depositToPartyStorage({ code: 'NO-ROOM', clientId: 'p1', item: ITEM, quantity: 1 }).error)
      .toBe(ERROR_CODE.ROOM_NOT_FOUND);
  });

  it('канон переживает рестарт: новый реестр читает файл', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'party-storage-507-'));
    const file = path.join(dir, 'storage.json');
    try {
      const first = createRoomRegistry({ now: () => 1000, partyStorageStore: createFilePartyStorageStore({ filePath: file }) });
      const { room } = first.createRoom({ clientId: 'gm-1', name: 'Стол' });
      first.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
      first.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
      const dep = first.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 3 });
      expect(dep.storage.entries).toHaveLength(1);

      // «Сервер перезапустили»: новый реестр, тот же файл, комната с тем же кодом.
      const second = createRoomRegistry({ now: () => 2000, partyStorageStore: createFilePartyStorageStore({ filePath: file }) });
      const restored = second.createRoom({ clientId: 'gm-1', name: 'Стол', requestedCode: room.code });
      expect(second.getState(restored.room.code).partyStorage.entries[0]).toMatchObject({
        name: 'Пулемёт', quantity: 3,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('507: протокол, словари и плашка', () => {
  it('константы зеркалятся в клиенте', () => {
    expect(ROOM_MESSAGE.STORAGE_STATE).toBe(MESSAGE.STORAGE_STATE);
    expect(ROOM_MESSAGE.STORAGE_DEPOSIT).toBe(MESSAGE.STORAGE_DEPOSIT);
    expect(ROOM_MESSAGE.STORAGE_WITHDRAW).toBe(MESSAGE.STORAGE_WITHDRAW);
    expect(ROOM_ERROR.STORAGE_FORBIDDEN).toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    expect(ROOM_ERROR.STORAGE_ENTRY_NOT_FOUND).toBe(ERROR_CODE.STORAGE_ENTRY_NOT_FOUND);
  });

  it('плашка во всю ширину под «Добыча»/«Торговля», название не настраивается', () => {
    const screen = read('components/screens/InventoryScreen/InventoryScreen.js');
    const styles = read('styles/InventoryScreen.styles.js');
    expect(screen).toContain('testID="shared-storage-button"');
    expect(screen).toContain("tInventory('screen.actions.sharedStorage')");
    expect(screen).toContain('<PartyStorageModal');
    expect(styles).toContain('sharedStorageCell');
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json'));
    expect(ru.actions.sharedStorage).toBe('Общее хранилище');
    expect(en.actions.sharedStorage).toBe('Shared storage');
    expect(ru.storage.title).toBe('Общее хранилище');
    expect(en.storage.title).toBe('Shared storage');
    // Настройки имени нет ни в словарях, ни в модалке.
    const modal = read('components/lootTrade/PartyStorageModal.js');
    expect(modal).not.toContain('rename');
    expect(modal).not.toContain('setName');
  });

  it('клиент обновляет состояние из STORAGE_STATE', () => {
    const store = read('src/room/roomStore.ts');
    expect(store).toContain('ROOM_MESSAGE.STORAGE_STATE');
    expect(store).toContain('partyStorage: storage');
    expect(store).toContain('depositToPartyStorage');
    expect(store).toContain('withdrawFromPartyStorage');
  });

  it('файл состояния не попадает в git', () => {
    expect(read('.gitignore')).toContain('.data/');
  });
});
