// Приёмочный тест 521: «мелочи склада» — лимиты, стаканье и два уже
// решённых вопроса (удаление шаблона, тихое срабатывание ключа).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE } from '../../server/protocol.js';
import { ROOM_ERROR } from '../../src/room/roomProtocol.ts';
import {
  STORAGE_LIMITS,
  storageStackKey,
  applyStorageDeposits,
} from '../../server/partyStorageRules.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const ITEM = { id: 'w1', name: 'Пулемёт', itemType: 'weapon', weight: 12, cost: 300 };
const OTHER = { id: 'w2', name: 'Дробовик', itemType: 'weapon', weight: 8, cost: 180 };

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm-1', name: 'Стол', ownerToken: 'token-1' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  return { registry, room };
};

const fill = (registry, room, count = STORAGE_LIMITS.MAX_ENTRIES) => {
  const entries = Array.from({ length: count }, (_, index) => ({
    entryId: `fill_${index}`,
    item: { id: `fill_${index}`, name: `Предмет ${index}`, itemType: 'misc' },
    name: `Предмет ${index}`,
    itemType: 'misc',
    quantity: 1,
  }));
  const restored = registry.restorePartyStorage({
    code: room.code, clientId: 'gm-1', storage: { revision: 10, entries },
  });
  expect(restored.applied).toBe(true);
  return entries;
};

describe('521: стаканье и лимиты «Общего хранилища»', () => {
  it('ключ стаканья не зависит от служебных полей экземпляра и порядка полей', () => {
    const a = { uniqueId: 'a', equipped: true, locked: false, quantity: 7, name: 'Пулемёт', id: 'w1' };
    const b = { id: 'w1', name: 'Пулемёт', quantity: 1, uniqueId: 'b', stackKey: 'x' };
    expect(storageStackKey(a)).toBe(storageStackKey(b));
    expect(storageStackKey(a)).not.toBe(storageStackKey({ ...a, name: 'Дробовик' }));
  });

  it('чистый слой склеивает поступление с существующей строкой', () => {
    const entries = [{
      entryId: 'e1', item: ITEM, name: 'Пулемёт', itemType: 'weapon', quantity: 2,
    }];
    const applied = applyStorageDeposits({
      entries,
      deposits: [{ item: ITEM, quantity: 3, name: 'Пулемёт' }],
      makeEntry: ({ item, name, quantity }) => ({ entryId: 'new', item, name, quantity }),
    });
    expect(applied.error).toBeNull();
    expect(applied.entries).toHaveLength(1);
    expect(applied.entries[0].quantity).toBe(5);
    expect(entries[0].quantity).toBe(2); // вход не мутируется
  });

  it('переполненный стек порождает новую строку, а не теряет предметы', () => {
    const entries = [{
      entryId: 'e1', item: ITEM, name: 'Пулемёт', itemType: 'weapon',
      quantity: STORAGE_LIMITS.MAX_STACK_QUANTITY,
    }];
    const applied = applyStorageDeposits({
      entries,
      deposits: [{ item: ITEM, quantity: 2, name: 'Пулемёт' }],
      makeEntry: ({ item, name, quantity }) => ({ entryId: 'new', item, name, quantity }),
    });
    expect(applied.error).toBeNull();
    expect(applied.entries).toHaveLength(2);
    expect(applied.entries[1].quantity).toBe(2);
  });

  it('лимит строк возвращает ошибку и не меняет исходный массив', () => {
    const entries = Array.from({ length: STORAGE_LIMITS.MAX_ENTRIES }, (_, i) => ({
      entryId: `e${i}`, item: { id: `x${i}` }, name: `X${i}`, quantity: 1,
    }));
    const applied = applyStorageDeposits({
      entries,
      deposits: [{ item: { id: 'fresh' }, quantity: 1, name: 'Новый' }],
      makeEntry: ({ item, name, quantity }) => ({ entryId: 'new', item, name, quantity }),
    });
    expect(applied.error).toBe('STORAGE_FULL');
    expect(applied.entries).toEqual(entries);
    expect(applied.added).toHaveLength(0);
  });

  it('сервер: два одинаковых предмета — одна строка, разные — две', () => {
    const { registry, room } = setup();
    registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 2 });
    const second = registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: ITEM, quantity: 3 });
    expect(second.error).toBeUndefined();
    expect(second.storage.entries).toHaveLength(1);
    expect(second.storage.entries[0].quantity).toBe(5);

    registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: OTHER, quantity: 1 });
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(2);
  });

  it('сервер: переполнение склада — понятный код ошибки, состояние не меняется', () => {
    const { registry, room } = setup();
    fill(registry, room);
    const before = registry.getState(room.code).partyStorage;
    const dep = registry.depositToPartyStorage({
      code: room.code, clientId: 'p1', item: OTHER, quantity: 1,
    });
    expect(dep.error).toBe(ERROR_CODE.STORAGE_FULL);
    expect(ROOM_ERROR.STORAGE_FULL).toBe(ERROR_CODE.STORAGE_FULL);
    const after = registry.getState(room.code).partyStorage;
    expect(after.entries).toHaveLength(STORAGE_LIMITS.MAX_ENTRIES);
    expect(after.revision).toBe(before.revision);
  });

  it('атомарный перенос: списание освобождает место, без списания — отказ', () => {
    const { registry, room } = setup();
    const entries = fill(registry, room);
    const rejected = registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [{ item: OTHER, quantity: 1, name: 'Дробовик' }],
      withdrawals: [],
    });
    expect(rejected.error).toBe(ERROR_CODE.STORAGE_FULL);
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(STORAGE_LIMITS.MAX_ENTRIES);

    const accepted = registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [{ item: OTHER, quantity: 1, name: 'Дробовик' }],
      withdrawals: [{ entryId: entries[0].entryId, quantity: 1 }],
    });
    expect(accepted.error).toBeUndefined();
    expect(accepted.storage.entries).toHaveLength(STORAGE_LIMITS.MAX_ENTRIES);
    expect(accepted.storage.entries.some((e) => e.name === 'Дробовик')).toBe(true);
  });

  it('ключевые записи не стакаются, не дублируются и занимают место', () => {
    const { registry, room } = setup();
    const first = registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm-1', keyItemId: 'k1', name: 'Ключ', description: '',
    });
    const duplicate = registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm-1', keyItemId: 'k1', name: 'Ключ', description: '',
    });
    expect(first.added).toBe(true);
    expect(duplicate.added).toBe(false);
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(1);

    fill(registry, room, STORAGE_LIMITS.MAX_ENTRIES - 1);
    expect(registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm-1', keyItemId: 'k2', name: 'Второй', description: '',
    }).error).toBeUndefined();
    expect(registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm-1', keyItemId: 'k3', name: 'Третий', description: '',
    }).error).toBe(ERROR_CODE.STORAGE_FULL);
  });

  it('импорт снимка сверх лимита отклоняется', () => {
    const { registry, room } = setup();
    const entries = Array.from({ length: STORAGE_LIMITS.MAX_ENTRIES + 1 }, (_, i) => ({
      entryId: `e${i}`, name: `X${i}`, item: { id: `x${i}` }, quantity: 1,
    }));
    expect(registry.restorePartyStorage({
      code: room.code, clientId: 'gm-1', storage: { revision: 20, entries },
    }).error).toBe(ERROR_CODE.STORAGE_FULL);
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(0);
  });

  it('две прежние «мелочи» уже закрыты: тихий ключ и удаление шаблона', () => {
    expect(read('server/roomRegistry.js')).toContain('уведомление Мастеру не шлём');
    expect(read('docs/changelog.ru.md')).toContain('удаление шаблона не гасит уже добытую запись');
    expect(read('components/lootTrade/PartyStorageModal.js')).toContain('screen.storage.full');
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json'));
    expect(ru.storage.full).toBeTruthy();
    expect(en.storage.full).toBeTruthy();
  });

  it('план и версия ведут на 521', () => {
    expect(read('docs/roadmap.md')).toContain('521');
    expect(JSON.parse(read('public/version.json')).version).toBe('521');
    expect(JSON.parse(read('patchs/baseline.json')).baseline).toBe('521');
    expect(read('docs/roadmap.md')).toContain('Иерархия');
  });
});
