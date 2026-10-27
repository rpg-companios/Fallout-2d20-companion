// domain/perks/capCollector.js
// КОЛЛЕКЦИОНЕР КРЫШЕК (406): покупки обходятся на 10% дешевле —
// окно покупки предзаполняет цену со скидкой (поле остаётся editable).

export const capCollectorPerk = {
  id: 'capCollector',
  apply() {
    return { capCollectorDiscountPercent: 10 };
  },
};
