// domain/perks/loadAndFire.js
// Заряжай и стреляй (текст перка — источник, уточнение 405):
// «Когда вы используете тяжелое оружие со скорострельностью 2 или выше,
// скорострельность этого оружия увеличивается на +1. На 2 ранге … +2».
// Оружие с очередями 0–1 («Толстяк», гранатомёты-одиночки) перком не
// усиливается. Скорострельность берётся УЖЕ С МОДАМИ: карточки оружия
// (инвентарь и экран снаряжения) зовут applyLoadAndFireToWeapon на
// обогащённом предмете — единая точка.

export const HEAVY_WEAPON_TYPE = 'Heavy';
export const MIN_FIRE_RATE_FOR_BONUS = 2;

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
 * Тяжёлое оружие со скорострельностью 2+ (с учётом модов) получает
 * прибавку; прочие предметы и «медленные» тяжёлые — как есть. Не мутирует вход.
 */
export const applyLoadAndFireToWeapon = (item, bonus) => {
  const b = Number(bonus) || 0;
  if (!b || !item || item.weaponType !== HEAVY_WEAPON_TYPE) return item;
  const base = Number(item.fireRate);
  if (!Number.isFinite(base) || base < MIN_FIRE_RATE_FOR_BONUS) return item;
  return { ...item, fireRate: base + b };
};
