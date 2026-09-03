import { describe, it, expect } from 'vitest';
import {
  getItemPrice, getCartTotal, getRemaining, isWithinRarity,
  canAfford, addToCart, changeQuantity, finishPurchase,
} from '../../domain/startingPurchase';

const pistol = { id: 'weapon_pistol', name: 'Пистолет', cost: 50, rarity: 1 };
const armor = { id: 'armor_leather', name: 'Кожаная броня', cost: 30, rarity: 2 };
const rare = { id: 'weapon_rare', name: 'Редкое', cost: 10, rarity: 4 };
const free = { id: 'item_free', name: 'Хлам', cost: 0, rarity: 0 };

describe('цена предмета', () => {
  it('читает cost и price, запятую тоже', () => {
    expect(getItemPrice({ cost: 50 })).toBe(50);
    expect(getItemPrice({ price: 20 })).toBe(20);
    expect(getItemPrice({ cost: '12,5' })).toBe(12.5);
  });

  it('мусор и отсутствие цены — ноль', () => {
    expect(getItemPrice({})).toBe(0);
    expect(getItemPrice(null)).toBe(0);
    expect(getItemPrice({ cost: 'дорого' })).toBe(0);
  });
});

describe('потолок редкости', () => {
  it('пропускает предметы не выше порога', () => {
    expect(isWithinRarity(pistol, 2)).toBe(true);
    expect(isWithinRarity(armor, 2)).toBe(true);
    expect(isWithinRarity(rare, 2)).toBe(false);
  });

  it('без порога проходит всё; без rarity предмет доступен', () => {
    expect(isWithinRarity(rare, null)).toBe(true);
    expect(isWithinRarity({ id: 'x' }, 2)).toBe(true);
  });
});

describe('корзина', () => {
  it('складывает одинаковые предметы в одну строку', () => {
    let cart = addToCart([], 500, pistol, 1, 2);
    cart = addToCart(cart, 500, pistol, 2, 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(getCartTotal(cart)).toBe(150);
  });

  it('считает остаток бюджета', () => {
    const cart = addToCart([], 200, pistol, 2, 2);
    expect(getRemaining(200, cart)).toBe(100);
  });

  it('не даёт уйти в минус: покупка сверх бюджета отклоняется', () => {
    const cart = addToCart([], 100, pistol, 3, 2);
    expect(cart).toEqual([]);
    expect(getRemaining(100, cart)).toBe(100);
  });

  it('не пускает предмет выше потолка редкости', () => {
    expect(addToCart([], 500, rare, 1, 2)).toEqual([]);
  });

  it('бесплатное добавляется даже при нулевом остатке', () => {
    const cart = addToCart([], 0, free, 1, 2);
    expect(cart).toHaveLength(1);
  });

  it('плюс не превышает бюджет, минус убирает строку', () => {
    let cart = addToCart([], 100, pistol, 1, 2);
    cart = changeQuantity(cart, 100, 'weapon_pistol', 1);
    expect(cart[0].quantity).toBe(2);

    const capped = changeQuantity(cart, 100, 'weapon_pistol', 1);
    expect(capped[0].quantity).toBe(2);

    let removed = changeQuantity(cart, 100, 'weapon_pistol', -2);
    expect(removed).toEqual([]);
  });

  it('несколько разных предметов складываются в общую сумму', () => {
    let cart = addToCart([], 500, pistol, 1, 2);
    cart = addToCart(cart, 500, armor, 2, 2);
    expect(cart).toHaveLength(2);
    expect(getCartTotal(cart)).toBe(50 + 60);
    expect(getRemaining(500, cart)).toBe(390);
  });
});

describe('завершение покупки', () => {
  it('отдаёт предметы и остаток крышек', () => {
    let cart = addToCart([], 500, pistol, 2, 2);
    cart = addToCart(cart, 500, armor, 1, 2);
    const result = finishPurchase(cart, 500);

    expect(result.spent).toBe(130);
    expect(result.remainingCaps).toBe(370);
    expect(result.items).toEqual([
      { ...pistol, quantity: 2 },
      { ...armor, quantity: 1 },
    ]);
  });

  it('ничего не купил — весь бюджет остаётся крышками', () => {
    const result = finishPurchase([], 500);
    expect(result.items).toEqual([]);
    expect(result.remainingCaps).toBe(500);
    expect(result.spent).toBe(0);
  });

  it('не мутирует исходную корзину', () => {
    const cart = addToCart([], 500, pistol, 1, 2);
    const snapshot = JSON.parse(JSON.stringify(cart));
    addToCart(cart, 500, armor, 1, 2);
    changeQuantity(cart, 500, 'weapon_pistol', 1);
    finishPurchase(cart, 500);
    expect(cart).toEqual(snapshot);
  });
});
