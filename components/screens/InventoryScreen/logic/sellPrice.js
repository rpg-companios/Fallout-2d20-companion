// Цена по умолчанию для диалога продажи (репорт владельца, 2026-09-11:
// «решил продать оставшиеся бутылки — цена высветилась 0»).
//
// Инстанс предмета хранит каталожную стоимость в поле `cost` (addNewItem,
// characterStore), а `price` появляется только у купленного — модалка покупки
// запоминает цену сделки (handleConfirmBuy). Диалог продажи читал только
// `price`, поэтому вся добыча/найденное выставлялось по умолчанию в 0.
//
// Цепочка по умолчанию: price (цена последней сделки) → cost (каталожная
// стоимость) → 0. Поле в модалке остаётся редактируемым: игрок назначает
// свою цену торговли.

/**
 * Цена продажи за штуку по умолчанию.
 * @param {{price?: number, cost?: number} | null | undefined} item — инстанс предмета.
 * @returns {number}
 */
export const defaultSellPricePerItem = (item) => {
  if (!item) return 0;
  const price = Number(item.price);
  if (Number.isFinite(price) && price > 0) return price;
  const cost = Number(item.cost);
  if (Number.isFinite(cost) && cost > 0) return cost;
  return 0;
};
