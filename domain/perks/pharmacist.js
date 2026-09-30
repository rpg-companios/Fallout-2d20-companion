// domain/perks/pharmacist.js
// Фармацевт (406): Рад-а-вей снимает на 1 радиацию больше
// (складывается с «Полевым хирургом» через mergePerkBonuses).

export const pharmacistPerk = {
  id: 'pharmacist',
  apply() {
    return { antiradRadiationBonus: 1 };
  },
};
