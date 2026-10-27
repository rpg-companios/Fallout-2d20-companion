// domain/perks/bloodsucker.js
// Bloodsucker (406): пакеты крови лечат вдвое сильнее (×2 к мгновенному
// лечению; удвоение прибавки Гурмана не входит — множитель до неё).
// Пакеты крови — напитки: жажду утоляют сами (база +1 ступень).
// Список id — данные заведены патчем 406 (data/consumables/drinks.json).

export const BLOOD_PACK_DRINK_IDS = [
  'drink_blood_pack',
  'drink_glowing_blood_pack',
  'drink_irradiated_blood',
];

export const bloodsuckerPerk = {
  id: 'bloodsucker',
  apply() {
    return {
      bloodPackDrinkIds: BLOOD_PACK_DRINK_IDS,
      bloodPackHealMultiplier: 2,
    };
  },
};
