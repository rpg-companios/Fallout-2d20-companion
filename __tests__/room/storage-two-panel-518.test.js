// Приёмочный тест 518: «Общее хранилище» по слову владельца.
// Мастер — отдельная карточка, только просмотр и трансляция ключей.
// Игрок — двупанельное окно по дизайну торговца, перенос по кнопке.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE, MESSAGE } from '../../server/protocol.js';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 'tok' });
  registry.joinRoom({ code: room.code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Игрок', role: 'player' });
  return { registry, room };
};

const seed = (registry, room) => registry.depositToPartyStorage({
  code: room.code, clientId: 'p1', name: 'Пулемёт',
  item: { name: 'Пулемёт', itemType: 'weapon' }, quantity: 2,
});

describe('518: Мастер не трогает вещи склада', () => {
  it('не может внести предметы ни старым, ни новым сообщением', () => {
    const { registry, room } = setup();
    expect(registry.depositToPartyStorage({
      code: room.code, clientId: 'gm', name: 'Крышки',
      item: { name: 'Крышки', itemType: 'misc' }, quantity: 1,
    }).error).toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    expect(registry.transferPartyStorage({
      code: room.code, clientId: 'gm',
      deposits: [{ item: { name: 'Крышки' }, quantity: 1 }], withdrawals: [],
    }).error).toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(0);
  });

  it('не может забрать предметы, а игрок может', () => {
    const { registry, room } = setup();
    const { entry } = seed(registry, room);
    expect(registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'gm', entryId: entry.entryId, quantity: 1,
    }).error).toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(1);
    expect(registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'p1', entryId: entry.entryId, quantity: 1,
    }).error).toBeUndefined();
  });

  it('по-прежнему может транслировать ключи', () => {
    const { registry, room } = setup();
    const added = registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm', keyItemId: 'k1', name: 'Метка фракции', description: '',
    });
    expect(added.added).toBe(true);
    expect(registry.getPartyStorage(room.code).entries[0].kind).toBe('keyItem');
  });
});

describe('518: перенос по кнопке атомарен', () => {
  it('до нажатия состояние не меняется; одна операция кладёт и забирает', () => {
    const { registry, room } = setup();
    const { entry } = seed(registry, room);
    const before = registry.getPartyStorage(room.code);
    const deposits = [{ item: { name: 'Аптечка', itemType: 'misc' }, quantity: 1, name: 'Аптечка' }];
    const withdrawals = [{ entryId: entry.entryId, quantity: 1 }];
    // Буфер существует только на клиенте: сервер ещё ничего не получил.
    expect(registry.getPartyStorage(room.code).revision).toBe(before.revision);

    const result = registry.transferPartyStorage({
      code: room.code, clientId: 'p1', deposits, withdrawals,
    });
    expect(result.error).toBeUndefined();
    expect(result.withdrawn).toHaveLength(1);
    expect(result.deposited).toHaveLength(1);
    const after = registry.getPartyStorage(room.code);
    expect(after.entries).toHaveLength(2);
    expect(after.entries.find((e) => e.entryId === entry.entryId).quantity).toBe(1);
    expect(after.entries.some((e) => e.name === 'Аптечка')).toBe(true);
    expect(after.revision).toBe(before.revision + 1);
  });

  it('любая некорректная строка отменяет ВСЮ операцию', () => {
    const { registry, room } = setup();
    const { entry } = seed(registry, room);
    const before = registry.getPartyStorage(room.code);
    const bad = registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [{ item: { name: 'Аптечка' }, quantity: 1 }],
      withdrawals: [{ entryId: 'нет_такой_записи', quantity: 1 }],
    });
    expect(bad.error).toBe(ERROR_CODE.STORAGE_ENTRY_NOT_FOUND);
    expect(registry.getPartyStorage(room.code).revision).toBe(before.revision);
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(1);
    expect(registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [], withdrawals: [{ entryId: entry.entryId, quantity: 99 }],
    }).error).toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
  });

  it('ключевую запись нельзя забрать даже через перенос', () => {
    const { registry, room } = setup();
    const { entry } = registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm', keyItemId: 'k1', name: 'Записка', description: '',
    });
    expect(registry.transferPartyStorage({
      code: room.code, clientId: 'p1', deposits: [],
      withdrawals: [{ entryId: entry.entryId, quantity: 1 }],
    }).error).toBe(ERROR_CODE.STORAGE_ENTRY_NOT_FOUND);
  });

  it('пустой буфер и отсутствие Мастера — отказ', () => {
    const { registry, room } = setup();
    expect(registry.transferPartyStorage({
      code: room.code, clientId: 'p1', deposits: [], withdrawals: [],
    }).error).toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
    registry.leaveRoom({ code: room.code, clientId: 'gm' });
    expect(registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [{ item: { name: 'X' }, quantity: 1 }], withdrawals: [],
    }).error).toBe(ERROR_CODE.STORAGE_GM_OFFLINE);
  });

  it('протокол и стор знают новое сообщение', () => {
    expect(MESSAGE.STORAGE_TRANSFER).toBe('storage.transfer');
    expect(ROOM_MESSAGE.STORAGE_TRANSFER).toBe(MESSAGE.STORAGE_TRANSFER);
    expect(read('src/room/roomStore.ts')).toContain('transferPartyStorage');
    expect(read('server/roomServer.js')).toContain('MESSAGE.STORAGE_TRANSFER');
  });
});

describe('518: окно по дизайну торговца', () => {
  const modal = read('components/lootTrade/PartyStorageModal.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');

  it('каркас строк, буфера и кнопки импортирован из торговца', () => {
    expect(modal).toContain("import { tradeOverlayStyles as trade } from './tradeOverlayStyles'");
    const shared = read('components/lootTrade/tradeOverlayStyles.js');
    expect(shared).toContain('export const tradeOverlayStyles = StyleSheet.create');
    expect(overlay).toContain("import { tradeOverlayStyles as styles } from './tradeOverlayStyles'");
    expect(modal).toContain('trade.tradeRow');
    expect(modal).toContain('trade.bufferRow');
    expect(modal).toContain('trade.commitTradeBtn');
  });

  it('перенос отложен до нажатия кнопки', () => {
    expect(modal).toContain('testID="storage-commit-button"');
    expect(modal).toContain('transferPartyStorage({');
    expect(modal).toContain('setGiveBuffer');
    expect(modal).toContain('setTakeBuffer');
    expect(modal).toContain("tInventory('screen.storage.pendingHint')");
    expect(modal).not.toContain('onPress={() => void deposit(item)}');
    expect(modal).not.toContain('onPress={() => void withdraw(entry)}');
  });

  it('нет цен, наценок и настроек торговца', () => {
    for (const forbidden of ['saleMarkupPercent', 'buyDepreciationPercent', 'markupPercent', 'shopPrice', 'caps']) {
      expect(modal).not.toContain(forbidden);
    }
  });

  it('у Мастера отдельная карточка и режим только для просмотра', () => {
    expect(screen).toContain("type: 'storage'");
    expect(screen).toContain('<StorageCardCell');
    expect(screen).toContain('<PartyStorageModal');
    expect(screen).toContain('gmView');
    expect(read('components/lootTrade/StorageCardCell.js')).toContain('testID="storage-card-cell"');
    expect(modal).toContain("tInventory(isGm ? 'screen.storage.gmTitle'");
    expect(modal).toContain("tInventory('screen.storage.gmNoActions')");
    expect(modal).toContain('gm-issue-key-');
  });

  it('у игроков кнопка в инвентаре осталась', () => {
    const inventory = read('components/screens/InventoryScreen/InventoryScreen.js');
    expect(inventory).toContain('<PartyStorageModal');
    expect(inventory).toContain('isPartyStorageVisible');
  });

  it('новые подписи парные RU/EN', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json')).storage;
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json')).storage;
    for (const key of ['bufferGive', 'bufferTake', 'commit', 'clearBuffer', 'pendingHint', 'gmTitle', 'gmNoActions', 'issueKey', 'issuedKey', 'noKeyItems']) {
      expect(ru[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
    const ruLt = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json')).actions;
    const enLt = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json')).actions;
    expect(ruLt.openStorage).toBeTruthy();
    expect(enLt.openStorage).toBeTruthy();
  });

  it('roadmap обновлён до 518', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('518');
    expect(plan).toContain('Осталось после патча 518');
    expect(plan).not.toContain('| 10 | ⏳');
    expect(plan).toContain('Мини-игра взлома замков');
  });
});
