// domain/perks/loadAndFire.js
// Заряжай и стреляй (референс владельца, 403; автоматизация 404):
// тяжёлое оружие (weaponType 'Heavy') — скорострельность +1 (ранг 1)
// или +2 (ранг 2+). «Каждый следующий перк — другой тип оружия» — книжная
// тонкость выбора, в приложении ранг даёт бонус на всё тяжёлое оружие.
// Применяется на карточках оружия (инвентарь и экран снаряжения) через
// applyLoadAndFireToWeapon — единая точка.

export const HEAVY_WEAPON_TYPE = 'Heavy';

export const loadAndFireBonusByRank = (rank) => {
  const r = Math.max(1, Number(rank) || 1);
  return r >= 2 ? 2 : 1;
};

export const loadAndFirePerk = {
  id: 'loadAndFire',
  apply(ctx) {
    return { loadAndFireBonus: loadAndFireBonusByRank(ctx.state.rank || 1) };
  },
};

/**
 * Тяжёлое оружие получает прибавку скорострельности; прочие предметы —
 * как есть. Не мутирует вход.
 */
export const applyLoadAndFireToWeapon = (item, bonus) => {
  const b = Number(bonus) || 0;
  if (!b || !item || item.weaponType !== HEAVY_WEAPON_TYPE) return item;
  const base = Number(item.fireRate);
  if (!Number.isFinite(base)) return item;
  return { ...item, fireRate: base + b };
};
