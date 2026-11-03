// Приёмочный тест 510, шаг 2 дизайна: ключевые записи на общем складе.
// «Предметов таких можно создавать много. Каждому предмету вручную нужно
// будет давать имя, описание ... Мастер может назвать предмет "ключ от склада"
// и не давать описания. Или может написать "Записка наёмника" ... В инвентаре
// эти предметы просто лежат с названием». Плюс решения: запись общая,
// забрать нельзя, добытое неприкосновенно.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { MESSAGE, ERROR_CODE } from '../../server/protocol.js';
import { ROOM_MESSAGE, ROOM_ERROR } from '../../src/room/roomProtocol.ts';
import {
  createStorageExportPayload,
  parseStorageImportPayload,
} from '../../domain/partyStorageTransfer.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 'tok' });
  registry.joinRoom({ code: room.code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Игрок', role: 'player' });
  return { registry, room };
};

describe('510: ключевая запись на складе', () => {
  it('Мастер выдаёт ключ; забрать его нельзя, прочитать можно', () => {
    const { registry, room } = setup();
    const added = registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm', keyItemId: 'key_42',
      name: 'Ключ от склада', description: '',
    });
    expect(added.error).toBeUndefined();
    expect(added.entry.kind).toBe('keyItem');
    expect(added.entry.description).toBe('');
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(1);

    expect(registry.withdrawFromPartyStorage({
      code: room.code, clientId: 'p1', entryId: added.entry.entryId,
    }).error).toBe(ERROR_CODE.STORAGE_KEY_READ_ONLY);
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(1);
  });

  it('ключ выдаёт только Мастер, дубликат не создаётся, без Мастера — отказ', () => {
    const { registry, room } = setup();
    expect(registry.addKeyItemToStorage({ code: room.code, clientId: 'p1', keyItemId: 'k', name: 'K' }).error)
      .toBe(ERROR_CODE.STORAGE_FORBIDDEN);
    const first = registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k', name: 'K' });
    expect(first.added).toBe(true);
    const second = registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k', name: 'K' });
    expect(second.added).toBe(false);
    expect(registry.getPartyStorage(room.code).entries).toHaveLength(1);
    registry.leaveRoom({ code: room.code, clientId: 'gm' });
    expect(registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k2', name: 'K2' }).error)
      .toBe(ERROR_CODE.ROOM_NOT_FOUND);
  });

  it('ключ, найденный в контейнере, уходит на общий склад', () => {
    const { registry, room } = setup();
    registry.openSession({
      code: room.code, clientId: 'gm',
      session: {
        name: 'Сейф', kind: 'loot', targetType: 'room',
        items: [{
          entryId: 'e1', itemId: 'key_77', itemType: 'misc', name: 'Записка наёмника',
          quantity: 1, keyItemId: 'key_77', keyDescription: 'Нажать левый верхний кирпич',
        }],
      },
    });
    const take = registry.lootTake({
      code: room.code, clientId: 'p1',
      payload: { characterId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    });
    expect(take.error).toBeUndefined();
    const keys = registry.getPartyStorage(room.code).entries.filter((e) => e.kind === 'keyItem');
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      keyItemId: 'key_77', name: 'Записка наёмника', description: 'Нажать левый верхний кирпич',
    });
  });

  it('ключи едут в JSON-снимке вместе со всем складом', () => {
    const { registry, room } = setup();
    registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm', keyItemId: 'key_1', name: 'Карточка', description: '**Код** 1234',
    });
    const exported = createStorageExportPayload({ code: room.code, storage: registry.getPartyStorage(room.code) });
    const imported = parseStorageImportPayload(JSON.stringify(exported));
    expect(imported.storage.entries[0]).toMatchObject({
      kind: 'keyItem', keyItemId: 'key_1', description: '**Код** 1234',
    });
  });
});

describe('510: справочник, редактор и карточка', () => {
  it('протокол зеркалится', () => {
    expect(ROOM_MESSAGE.STORAGE_ADD_KEY).toBe(MESSAGE.STORAGE_ADD_KEY);
    expect(ROOM_ERROR.STORAGE_KEY_READ_ONLY).toBe(ERROR_CODE.STORAGE_KEY_READ_ONLY);
  });

  it('справочник Мастера хранится локально, описание с тегами и предпросмотром', () => {
    expect(read('db/schema.js')).toContain('gm_key_items');
    expect(read('db/Database.js')).toContain('saveGmKeyItem');
    expect(read('db/Database.web.js')).toContain('getGmKeyItems');
    const catalog = read('components/lootTrade/KeyItemCatalogModal.js');
    expect(catalog).toContain('renderTextWithIcons');
    expect(catalog).toContain('key-item-description');
    expect(catalog).toContain('addKeyItemToStorage');
    expect(read('components/screens/LootTradeScreen/LootTradeScreen.js')).toContain('testID="key-catalog-button"');
  });

  it('окно склада показывает ключи отдельно и без кнопки «Забрать»', () => {
    const modal = read('components/lootTrade/PartyStorageModal.js');
    expect(modal).toContain("entry.kind !== 'keyItem'");
    expect(modal).toContain("entry.kind === 'keyItem'");
    expect(modal).toContain('renderTextWithIcons');
    expect(modal).toContain('screen.storage.keyStays');
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json')).keyItems;
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json')).keyItems;
    expect(ru.title).toBe('Ключи и записки');
    expect(en.title).toBe('Keys and notes');
    expect(ru.descriptionPlaceholder).toBeTruthy();
  });
});
