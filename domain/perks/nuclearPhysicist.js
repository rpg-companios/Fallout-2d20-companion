// domain/perks/nuclearPhysicist.js
// При получении Ядерного блока к выпавшему броску добавляется +3 заряда.
// Результат может превышать maxCharges (например, 23/20).
//
// Вторая часть перка (+1 рад-урон за выпавший Эффект рад-оружия) —
// механически не реализована (нет дисплея урона, Q1).

export const nuclearPhysicistPerk = {
  id: 'nuclearPhysicist',
  apply() {
    return { fusionCoreChargeBonus: 3 };
  },
};
