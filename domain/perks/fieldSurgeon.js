// domain/perks/fieldSurgeon.js
// Полевой хирург (406): стимпак лечит на +3 ОЗ больше, Рад-а-вей снимает
// на 1 радиацию больше. Применяется в resolveConsumableVitalChanges
// (домен/effects.js) при употреблении; стимпаки опознаются префиксом id.

export const STIMPAK_ID_PREFIX = 'chem_stimpak';

export const fieldSurgeonPerk = {
  id: 'fieldSurgeon',
  apply() {
    return { stimpakHpBonus: 3, antiradRadiationBonus: 1 };
  },
};
