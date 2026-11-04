// Приёмочный тест 522: один закон предмета для инвентаря, общего хранилища и
// торговцев. Игровых ограничений веса/количества нет; защита сервера на месте.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stacking from '../../domain/itemStacking.js';
import rules from '../../server/partyStorageRules.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE, LIMITS } from '../../server/protocol.js';
import {
  normalizeContainerItem,
  addOrMergeContainerItem,
  computeMerchantBuybackPriceFromPlayer,
} from '../../domain/lootTrade.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const BASE = {
  id: 'w1', weaponId: 'w1', itemType: 'weapon', name: 'Винтовка',
  cost: 100, weight: 5, appliedMods: { barrel: 'long' },
  durability: 80, durabilityTracked: true, charges: 3,
  hpCurrent: 9, uniqQualities: ['q1'], baseName: 'Стандарт',
  uniqueId: 'u-1', stackKey: 'w1_mods_long', equipInstanceId: 'e-1',
};

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm-1', name: 'Стол', ownerToken: 'token-1' });
  registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Первый', role: 'player' });
  return { registry, room };
};

describe('522: единая механика предметов', () => {
  it('стек-ключ игнорирует служебные поля размещения, но различает живое состояние', () => {
    const same = { ...BASE, uniqueId: 'u-2', quantity: 99, equipped: true, locked: true };
    expect(stacking.itemStackKey(BASE)).toBe(stacking.itemStackKey(same));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, appliedMods: { barrel: 'short' } }));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, charges: 2 }));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, durability: 40 }));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, hpCurrent: 4 }));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, uniqQualities: ['q2'] }));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, baseName: 'Другой' }));
    expect(stacking.itemStackKey(BASE)).not.toBe(
      stacking.itemStackKey({ ...BASE, id: 'w2', weaponId: 'w2' }));
  });

  it('ядерные блоки с разными зарядами — разные стопки везде', () => {
    const core = (charges) => ({ id: stacking.FUSION_CORE_ID, itemType: 'ammo', charges });
    expect(stacking.itemStackKey(core(10))).not.toBe(stacking.itemStackKey(core(9)));
    expect(stacking.itemStackKey(core(10))).toBe(stacking.itemStackKey(core(10)));
  });

  it('перенос не обрезает поля: моды, состояние, id и ключ стака остаются', () => {
    const snap = stacking.itemTransferSnapshot(BASE, { effectiveCost: 480, effectiveWeight: 9 });
    expect(snap.appliedMods).toEqual(BASE.appliedMods);
    expect(snap.charges).toBe(3);
    expect(snap.durability).toBe(80);
    expect(snap.hpCurrent).toBe(9);
    expect(snap.uniqQualities).toEqual(['q1']);
    expect(snap.baseName).toBe('Стандарт');
    expect(snap.uniqueId).toBe('u-1');
    expect(snap.stackKey).toBe('w1_mods_long');
    expect(snap.equipInstanceId).toBe('e-1');
    expect(snap.quantity).toBe(1);
    expect(snap.equipped).toBe(false);
    expect(stacking.itemStackKey(snap)).toBe(stacking.itemStackKey(BASE));
  });

  it('цена и вес читаются из эффективных полей (модов), а не голой базы', () => {
    expect(stacking.effectiveItemCost({ cost: 100, effectiveCost: 480 })).toBe(480);
    expect(stacking.effectiveItemWeight({ weight: 5, effectiveWeight: 9 })).toBe(9);
    expect(stacking.effectiveItemCost({ cost: '1 234,5' })).toBe(1234.5);
    expect(stacking.effectiveItemWeight({ weight: '2,5' })).toBe(2.5);
  });

  it('все три потребителя берут правила из domain/itemStacking.js', () => {
    // канон лежит внутри server/, чтобы изолированный деплой не тянул domain/
    expect(read('domain/itemStacking.js')).toContain("require('../server/itemStacking.js')");
    expect(read('server/itemStacking.js')).toContain('const itemStackKey');
    expect(read('components/screens/InventoryScreen/InventoryScreen.js')).toContain('domain/itemStacking.js');
    expect(read('server/partyStorageRules.js')).toContain("'./itemStacking.js'");
    expect(read('server/lootTradeSession.js')).toContain("'./itemStacking.js'");
    expect(read('domain/lootTrade.js')).toContain("'./itemStacking.js'");
    expect(read('components/lootTrade/PartyStorageModal.js')).toContain('domain/itemStacking.js');
    // локальный дубль закона стака из инвентаря удалён
    expect(read('components/screens/InventoryScreen/InventoryScreen.js')).not.toContain('__legacyStackKey');
    // больше не выкидываем appliedMods / uniqueId / stackKey
    expect(read('components/lootTrade/PartyStorageModal.js')).not.toContain('appliedMods, ...rest');
    expect(read('src/lootTrade/grantCharacterItems.js')).not.toContain('delete cleanSnapshot.uniqueId');
    expect(read('src/lootTrade/grantCharacterItems.js')).toContain('getItemPrice(resolved) || catalogCost');
  });
});

describe('522: склад без игровых лимитов', () => {
  const makeEntry = ({ item, name, quantity }) => ({
    entryId: `new-${Math.random()}`, item, name, quantity,
  });

  it('разные моды и заряды дают разные строки, одинаковые склеиваются', () => {
    const first = rules.applyStorageDeposits({
      entries: [],
      deposits: [
        { item: BASE, quantity: 2, name: 'Винтовка' },
        { item: { ...BASE, appliedMods: { barrel: 'short' } }, quantity: 1, name: 'Винтовка' },
        { item: { ...BASE, charges: 2 }, quantity: 1, name: 'Винтовка' },
      ],
      makeEntry,
    });
    expect(first.error).toBeNull();
    expect(first.entries).toHaveLength(3);

    const merged = rules.applyStorageDeposits({
      entries: first.entries,
      deposits: [{ item: BASE, quantity: 4, name: 'Винтовка' }],
      makeEntry,
    });
    expect(merged.entries).toHaveLength(3);
    expect(merged.entries[0].quantity).toBe(6);
  });

  it('нет потолка стопки, числа строк и количества за операцию', () => {
    const huge = rules.applyStorageDeposits({
      entries: [], deposits: [{ item: BASE, quantity: 100000, name: 'Винтовка' }], makeEntry,
    });
    expect(huge.error).toBeNull();
    expect(huge.entries[0].quantity).toBe(100000);

    const many = rules.applyStorageDeposits({
      entries: [],
      deposits: Array.from({ length: 300 }, (_, i) => ({
        item: { ...BASE, id: `x${i}`, weaponId: `x${i}` }, quantity: 1, name: `Предмет ${i}`,
      })),
      makeEntry,
    });
    expect(many.error).toBeNull();
    expect(many.entries).toHaveLength(300);
  });

  it('сервер принимает большой перенос и не знает кода STORAGE_FULL', () => {
    const { registry, room } = setup();
    const dep = registry.depositToPartyStorage({
      code: room.code, clientId: 'p1', item: BASE, quantity: 100000,
    });
    expect(dep.error).toBeUndefined();
    expect(dep.storage.entries[0].quantity).toBe(100000);
    expect(dep.storage.entries[0].item.appliedMods).toEqual(BASE.appliedMods);
    expect(ERROR_CODE.STORAGE_FULL).toBeUndefined();
    expect(read('components/lootTrade/PartyStorageModal.js')).not.toContain('STORAGE_FULL');
  });

  it('атомарный перенос «Перенести» сохраняет моды и состояние предмета', () => {
    const { registry, room } = setup();
    registry.depositToPartyStorage({ code: room.code, clientId: 'p1', item: BASE, quantity: 2 });
    const changed = { ...BASE, appliedMods: { barrel: 'short' }, charges: 1 };
    const result = registry.transferPartyStorage({
      code: room.code, clientId: 'p1',
      deposits: [{ item: changed, quantity: 1, name: 'Винтовка' }],
      withdrawals: [{ entryId: registry.getState(room.code).partyStorage.entries[0].entryId, quantity: 1 }],
    });
    expect(result.error).toBeUndefined();
    const entries = result.storage.entries;
    expect(entries.some((e) => e.item?.charges === 1 && e.item?.appliedMods?.barrel === 'short')).toBe(true);
    expect(entries.some((e) => e.item?.charges === 3 && e.item?.appliedMods?.barrel === 'long')).toBe(true);
  });
});

describe('522: защита сервера осталась священной', () => {
  const makeEntry = ({ item, name, quantity }) => ({ entryId: 'new', item, name, quantity });

  it('некорректное количество отклоняется до всякого изменения состояния', () => {
    const entries = [{ entryId: 'e1', item: BASE, name: 'Винтовка', quantity: 2 }];
    for (const bad of [0, -1, 1.5, NaN, Infinity, 'abc', Number.MAX_SAFE_INTEGER + 1]) {
      const result = rules.applyStorageDeposits({
        entries, deposits: [{ item: BASE, quantity: bad, name: 'Винтовка' }], makeEntry,
      });
      expect(result.error).toBe('STORAGE_BAD_MESSAGE');
      expect(result.entries).toEqual(entries);
      expect(result.added).toHaveLength(0);
    }
  });

  it('сетевой снимок санитайзится: прототипные ключи, циклы и переполнение', () => {
    const dirty = JSON.parse('{"id":"x","__proto__":{"polluted":true},"constructor":{"x":1},"appliedMods":{"a":"b"}}');
    const clean = stacking.sanitizeItemSnapshot(dirty);
    expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(clean, 'constructor')).toBe(false);
    expect(clean.appliedMods).toEqual({ a: 'b' });
    expect({}.polluted).toBeUndefined();

    const cyclic = { id: 'x' };
    cyclic.self = cyclic;
    expect(stacking.sanitizeItemSnapshot(cyclic)).toBeNull();
    expect(stacking.sanitizeItemSnapshot({ blob: 'x'.repeat(stacking.MAX_SNAPSHOT_BYTES + 10) })).toBeNull();
    expect(stacking.sanitizeItemSnapshot(null)).toBeNull();
  });

  it('предел размера сообщения и число операций в сообщении не ослаблены', () => {
    expect(LIMITS.MAX_MESSAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(rules.PROTOCOL_MAX_TRANSFER_OPERATIONS).toBe(50);
    const { registry, room } = setup();
    const deposits = Array.from({ length: 51 }, (_, i) => ({
      item: { ...BASE, id: `p${i}`, weaponId: `p${i}` }, quantity: 1, name: `P${i}`,
    }));
    expect(registry.transferPartyStorage({
      code: room.code, clientId: 'p1', deposits, withdrawals: [],
    }).error).toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
  });

  it('недопустимое количество от сервера тоже отбивается', () => {
    const { registry, room } = setup();
    expect(registry.depositToPartyStorage({
      code: room.code, clientId: 'p1', item: BASE, quantity: -5,
    }).error).toBe(ERROR_CODE.STORAGE_BAD_MESSAGE);
  });
});

describe('522: торговцы считают цену с модами', () => {
  const raw = (extra = {}) => ({
    itemId: 'w1', itemType: 'weapon', name: 'Винтовка', quantity: 1,
    cost: 100, weight: 5, effectiveCost: 480, effectiveWeight: 9,
    itemSnapshot: { ...BASE, effectiveCost: 480, effectiveWeight: 9 },
    ...extra,
  });

  it('нормализация записи сохраняет снимок и берёт эффективную цену/вес', () => {
    const entry = normalizeContainerItem(raw());
    expect(entry.cost).toBe(480);
    expect(entry.weight).toBe(9);
    expect(entry.itemSnapshot.appliedMods).toEqual(BASE.appliedMods);
    expect(entry.itemSnapshot.charges).toBe(3);
    expect(entry.itemSnapshot.stackKey).toBe(BASE.stackKey);
  });

  it('разные моды не склеиваются в одну позицию торговца', () => {
    const list = addOrMergeContainerItem([], raw());
    const next = addOrMergeContainerItem(list, raw({
      itemSnapshot: { ...BASE, appliedMods: { barrel: 'short' }, effectiveCost: 300 },
      effectiveCost: 300,
    }));
    expect(next).toHaveLength(2);
    const same = addOrMergeContainerItem(next, raw());
    expect(same).toHaveLength(2);
    expect(same.find((e) => e.cost === 480).quantity).toBe(2);
  });

  it('скупка модифицированного оружия дороже базового', () => {
    const opts = { buyDepreciationPercent: 50, capCollectorPercent: 0 };
    const base = computeMerchantBuybackPriceFromPlayer({ cost: 100 }, opts);
    const modded = computeMerchantBuybackPriceFromPlayer({ cost: 100, effectiveCost: 480 }, opts);
    expect(base).toBeGreaterThan(0);
    expect(modded).toBeGreaterThan(base);
  });

  it('UI продажи и карточка товара используют эффективные числа', () => {
    expect(read('components/lootTrade/PlayerLootTradeOverlay.js')).toContain('effectiveCost');
    expect(read('components/screens/LootTradeScreen/modals/ContainerItemConfigModal.js')).toContain('effectiveItemCost(item)');
    expect(read('components/screens/LootTradeScreen/LootTradeScreen.js')).toContain('effectiveCost: baseCost');
  });
});

describe('522: двухпанельное окно склада не изменилось', () => {
  it('буфер + «Перенести», локальные колбэки, без цен/экипировки/настроек', () => {
    const src = read('components/lootTrade/PartyStorageModal.js');
    expect(src).toContain('onDepositLocal');
    expect(src).toContain('onWithdrawLocal');
    expect(src).toContain('«Перенести»');
    expect(src).toContain('setGiveBuffer');
    expect(src).toContain('setTakeBuffer');
    expect(src).not.toContain('markupPercent');
    expect(src).not.toContain('equipItem');
  });
});

describe('522: документы и версия', () => {
  it('версия, план и заметки ведут на 522', () => {
    // Номер растёт дальше по цепочке: правила 522 обязаны сохраняться.
    expect(Number(JSON.parse(read('public/version.json')).version)).toBeGreaterThanOrEqual(522);
    expect(Number(JSON.parse(read('patchs/baseline.json')).baseline)).toBeGreaterThanOrEqual(522);
    expect(read('docs/roadmap.md')).toContain('522');
    expect(read('docs/changelog.ru.md')).toContain('522');
    expect(read('docs/changelog.en.md')).toContain('522');
    expect(read('docs/patch-522-install.md')).toContain('522');
    expect(read('patchs/522-storage-identity.patch')).toContain('domain/itemStacking.js');
  });
});
