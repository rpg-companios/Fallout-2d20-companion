// domain/startingPurchase.js
// Стартовая покупка: корзина с бюджетом. Ни React, ни данных сеттинга.
//
// Игрок получает сумму крышек и тратит её за один заход на предметы не выше
// заданной редкости. Что не потрачено — остаётся обычными крышками, поэтому
// «обязательного минимума» здесь нет: движок не заставляет покупать.
//
// Каунтером бюджет НЕ является: он живёт только пока открыто окно и в сейв
// не попадает (правило 1 — производные не храним).

/** Цена предмета из каталога. Разные категории зовут поле по-разному. */
export const getItemPrice = (item) => {
  const raw = item?.cost ?? item?.price ?? 0;
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : 0;
};

/** Ключ, по которому одинаковые предметы складываются в одну строку корзины. */
export const getCartKey = (item) => (
  item?.id || item?.weaponId || item?.armorId || item?.clothingId || item?.itemId || item?.name || null
);

/** Итоговая стоимость корзины. */
export const getCartTotal = (cart = []) => (
  cart.reduce((sum, line) => sum + getItemPrice(line.item) * (line.quantity || 0), 0)
);

/** Сколько крышек осталось. Не опускается ниже нуля. */
export const getRemaining = (budget, cart = []) => (
  Math.max(0, (Number(budget) || 0) - getCartTotal(cart))
);

/**
 * Проходит ли предмет по потолку редкости.
 * Запись без `rarity` считается доступной: отсутствие поля — не повод прятать.
 */
export const isWithinRarity = (item, maxRarity) => {
  if (!Number.isFinite(maxRarity)) return true;
  const rarity = Number(item?.rarity);
  return !Number.isFinite(rarity) || rarity <= maxRarity;
};

/**
 * Можно ли добавить `quantity` штук: хватает ли остатка и проходит ли предмет
 * по редкости. Бесплатные предметы (цена 0) добавлять можно всегда.
 */
export const canAfford = (cart, budget, item, quantity = 1, maxRarity = null) => {
  if (!item || quantity <= 0) return false;
  if (!isWithinRarity(item, maxRarity)) return false;
  const price = getItemPrice(item);
  if (price === 0) return true;
  return price * quantity <= getRemaining(budget, cart);
};

/**
 * Добавляет предмет в корзину. Одинаковые предметы складываются в одну
 * строку. Если денег не хватает — корзина возвращается без изменений
 * (тот же объект), чтобы вызывающий мог это заметить.
 */
export const addToCart = (cart = [], budget, item, quantity = 1, maxRarity = null) => {
  if (!canAfford(cart, budget, item, quantity, maxRarity)) return cart;
  const key = getCartKey(item);
  if (!key) return cart;

  const index = cart.findIndex((line) => line.key === key);
  if (index === -1) return [...cart, { key, item, quantity }];

  return cart.map((line, i) => (
    i === index ? { ...line, quantity: line.quantity + quantity } : line
  ));
};

/**
 * Меняет количество строки на `delta`. Ноль и ниже — строка убирается.
 * Увеличение сверх бюджета игнорируется.
 */
export const changeQuantity = (cart = [], budget, key, delta) => {
  const line = cart.find((entry) => entry.key === key);
  if (!line) return cart;

  const next = line.quantity + delta;
  if (next <= 0) return cart.filter((entry) => entry.key !== key);

  if (delta > 0) {
    const withoutLine = cart.filter((entry) => entry.key !== key);
    const rest = getCartTotal(withoutLine);
    const price = getItemPrice(line.item);
    if (price > 0 && rest + price * next > (Number(budget) || 0)) return cart;
  }

  return cart.map((entry) => (entry.key === key ? { ...entry, quantity: next } : entry));
};

/**
 * Итог покупки: предметы для инвентаря и остаток крышек.
 * Предметы уходят НЕ надетыми — игрок надевает сам.
 */
export const finishPurchase = (cart = [], budget) => ({
  items: cart.map((line) => ({ ...line.item, quantity: line.quantity })),
  remainingCaps: getRemaining(budget, cart),
  spent: getCartTotal(cart),
});
