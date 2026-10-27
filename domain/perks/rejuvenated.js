// domain/perks/rejuvenated.js
// ОМОЛОДИВШИЙСЯ (406, слово владельца): на высшей ступени сытости
// Макс. ОЗ +2 (применяется в derivedStats, флаг wellFed считает стор).
// «Держится дольше»: сытость и жажда спускаются вдвое медленнее
// (множитель накопления часов лестниц в тике выживания).
// Перебросы и +1 ОД из книги — бой/проверки, живут текстом.

export const REJUVENATED_SATED_MAX_HP = 2;

export const rejuvenatedPerk = {
  id: 'rejuvenated',
  apply() {
    return {
      rejuvenatedSatedMaxHp: REJUVENATED_SATED_MAX_HP,
      ladderAccRates: { food: 0.5, water: 0.5 },
    };
  },
};
