// Репорт владельца (2026-09-11): «решил продать оставшиеся бутылки —
// цены высветилась 0». Инстанс воды из «Добавить добычу» хранит каталожную
// cost: 20, но не price (его ставит только модалка покупки). Диалог продажи
// читал только price → 0. Фикс: defaultSellPricePerItem = price → cost → 0.

import { describe, expect, it } from 'vitest';
import { defaultSellPricePerItem } from '../../components/screens/InventoryScreen/logic/sellPrice';
import fs from 'node:fs';
import path from 'node:path';

describe('defaultSellPricePerItem: цена продажи по умолчанию', () => {
  it('у купленного — цена последней сделки (price)', () => {
    expect(defaultSellPricePerItem({ price: 15, cost: 20 })).toBe(15);
  });

  it('у добытого — каталожная стоимость (cost), как у воды из репорта', () => {
    // Реальная форма инстанса после addNewItem (cost сохраняется, price нет).
    const water = {
      id: 'drink_purified_water', instanceId: 'drink_purified_water',
      itemType: 'drinks', quantity: 3, cost: 20, rarity: 1, weight: 0.5,
    };
    expect(defaultSellPricePerItem(water)).toBe(20);
  });

  it('без обеих цен — 0 (редактируемое поле)', () => {
    expect(defaultSellPricePerItem({})).toBe(0);
    expect(defaultSellPricePerItem(null)).toBeNull ? expect(defaultSellPricePerItem(null)).toBe(0) : true;
    expect(defaultSellPricePerItem(undefined)).toBe(0);
  });

  it('некорректные значения не пролезают (0/NaN/отрицательная cost)', () => {
    expect(defaultSellPricePerItem({ price: 0, cost: 20 })).toBe(20);
    expect(defaultSellPricePerItem({ price: NaN, cost: 20 })).toBe(20);
    expect(defaultSellPricePerItem({ cost: '12' })).toBe(12);
    expect(defaultSellPricePerItem({ price: -5, cost: -3 })).toBe(0);
  });

  it('модалка продажи использует хелпер (статическая проверка исходника)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../components/screens/InventoryScreen/modals/SellItemModal.js'),
      'utf8',
    );
    expect(source).toContain('defaultSellPricePerItem(item)');
    expect(source).not.toMatch(/initialPrice\s*=\s*item\.price/);
  });
});
