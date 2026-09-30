// domain/perks/powerUser.js
// Power User (406): энергоядро при получении держит +1 заряд
// (складывается с «Физиком-ядерщиком»: 3 + 1 = 4).

export const powerUserPerk = {
  id: 'powerUser',
  apply() {
    return { fusionCoreChargeBonus: 1 };
  },
};
