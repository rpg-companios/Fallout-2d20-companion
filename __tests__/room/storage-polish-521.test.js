// Исторический приёмочный тест 521, приведённый к закону 522: игровые лимиты
// веса/количества отменены, стаканье идёт по общему доменному модулю, а защита
// сервера (валидация, санитайзинг, атомарность) сохранена.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE } from '../../server/protocol.js';
import rules from '../../server/partyStorageRules.js';

const { storageStackKey, applyStorageDeposits } = rules;
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

const fill = (registry, room, count = 200) => {
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

describe('521 → 522: стаканье «Общего хранилища» без игровых лимитов', () => {
  it('ключ стаканья не зависит от служебных полей экземпляра и порядка полей', () => {
    const a = { uniqueId: 'a', equipped: true, locked: false, quantity: 7, name: 'Пулемёт', id: 'w1' };
    const b = { id: 'w1', name: 'Пулемёт', quantity: 1, uniqueId: 'b', stackKey: 'x' };
    expect(storageStackKey(a)).toBe(storageStackKey(b));
    // имя и количество не меняют идентичность, а каталожный id — меняет
    expect(storageStackKey(a)).not.toBe(storageStackKey({ ...a, id: 'w2' }));
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

  it('огромная стопка не «переполняется» и не теряет предметы', () => {
    const entries = [{
      entryId: 'e1', item: ITEM, name: 'Пулемёт', itemType: 'weapon', quantity: 999,
    }];
    const applied = applyStorageDeposits({
      entries,
      deposits: [{ item: ITEM, quantity: 100000, name: 'Пулемёт' }],
      makeEntry: ({ item, name, quantity }) => ({ entryId: 'new', item, name, quantity }),
    });
    expect(applied.error).toBeNull();
    expect(applied.entries).toHaveLength(1);
    expect(applied.entries[0].quantity).toBe(100999);
  });

  it('число строк не ограничено игрой', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      entryId: `e${i}`, item: { id: `x${i}` }, name: `X${i}`, quantity: 1,
    }));
    const applied = applyStorageDeposits({
      entries,
      deposits: [{ item: { id: 'fresh' }, quantity: 1, name: 'Новый' }],
      makeEntry: ({ item, name, quantity }) => ({ entryId: 'new', item, name, quantity }),
    });
    expect(applied.error).toBeNull();
    expect(applied.entries).toHaveLength(201);
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

  it('сервер: заполненный склад всё равно принимает новые предметы', () => {
    const { registry, room } = setup();
    fill(registry, room, 200);
    const before = registry.getState(room.code).partyStorage;
    const dep = registry.depositToPartyStorage({
      code: room.code, clientId: 'p1', item: OTHER, quantity: 1,
    });
    expect(dep.error).toBeUndefined();
    const after = registry.getState(room.code).partyStorage;
    expect(after.entries).toHaveLength(201);
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  it('атомарный перенос: списание не нужно для приёма, состояние меняется один раз', () => {
    const { registry, room } = setup();
    const entries = fill(registry, room, 20);
    const accepted = registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [{ item: OTHER, quantity: 1, name: 'Дробовик' }],
      withdrawals: [{ entryId: entries[0].entryId, quantity: 1 }],
    });
    expect(accepted.error).toBeUndefined();
    expect(accepted.storage.entries.some((e) => e.name === 'Дробовик')).toBe(true);
    expect(accepted.storage.entries).toHaveLength(20);
  });

  it('ключевые записи не стакаются, не дублируются и не имеют лимита', () => {
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

    fill(registry, room, 250);
    expect(registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm-1', keyItemId: 'k2', name: 'Второй', description: '',
    }).error).toBeUndefined();
    expect(registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm-1', keyItemId: 'k3', name: 'Третий', description: '',
    }).error).toBeUndefined();
  });

  it('импорт снимка любого размера принимается, но некорректный — отклоняется', () => {
    const { registry, room } = setup();
    const entries = Array.from({ length: 250 }, (_, i) => ({
      entryId: `e${i}`, name: `X${i}`, item: { id: `x${i}` }, quantity: 1,
    }));
    expect(registry.restorePartyStorage({
      code: room.code, clientId: 'gm-1', storage: { revision: 20, entries },
    }).error).toBeUndefined();
    expect(registry.getState(room.code).partyStorage.entries).toHaveLength(250);

    expect(registry.restorePartyStorage({
      code: room.code, clientId: 'gm-1', storage: { revision: 21, entries: 'не массив' },
    }).error).toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
  });

  it('две прежние «мелочи» закрыты: тихий ключ и удаление шаблона', () => {
    expect(read('server/roomRegistry.js')).toContain('уведомление Мастеру не шлём');
    expect(read('docs/changelog.ru.md')).toContain('удаление шаблона не гасит уже добытую запись');
    expect(read('components/lootTrade/PartyStorageModal.js')).toContain('screen.storage.failed');
    const ru = JSON.parse(read('i18n/ru-RU/screens/inventory/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/inventory/screen.json'));
    expect(ru.storage.failed).toBeTruthy();
    expect(en.storage.failed).toBeTruthy();
  });

  it('план и версия ведут на 522, а иерархия всё ещё в плане', () => {
    expect(read('docs/roadmap.md')).toContain('522');
    expect(JSON.parse(read('public/version.json')).version).toBe('522');
    expect(JSON.parse(read('patchs/baseline.json')).baseline).toBe('522');
    expect(read('docs/roadmap.md')).toContain('Иерархия');
  });
});
