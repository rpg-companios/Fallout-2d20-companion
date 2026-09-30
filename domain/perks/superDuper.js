// domain/perks/superDuper.js
// Super Duper (406, слово владельца): при каждом создании предмета
// бросается боевой кубик; выпал Эффект — половина потраченных материалов
// возвращается в сумку (по каждой строке floor, «округление в меньшую»).
// Механика в адаптере крафта (modules/fallout/crafting/operations.js).

export const superDuperPerk = {
  id: 'superDuper',
  apply() {
    return { superDuper: true };
  },
};
