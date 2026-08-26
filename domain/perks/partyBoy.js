// domain/perks/partyBoy.js
// Невосприимчив к алко-зависимости: при наличии перка зависимость от
// алкогольных напитков (item.isAlcohol === true) не применяется.
// +2 ОЗ за каждый алкогольный напиток — механика лечения (Q8, не реализована).

export const partyBoyPerk = {
  id: 'partyBoy',
  apply() {
    return { alcoholAddictionImmune: true };
  },
};
