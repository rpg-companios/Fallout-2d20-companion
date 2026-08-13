const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const isAmmoWeapon = (weapon) => {
  const ammoId = weapon?.ammoId;
  return Boolean(ammoId && ammoId !== 'ammo_anything');
};

export const rollWeaponDurability = () => Math.floor(Math.random() * 100) + 1;

const normalizeQualities = (qualities) => {
  if (typeof qualities === 'string') {
    try { return JSON.parse(qualities); } catch (_) { return []; }
  }
  return Array.isArray(qualities) ? qualities : [];
};

export const getDurabilityMultiplier = (qualities) => {
  const ids = new Set(normalizeQualities(qualities).map((quality) => quality?.qualityId || quality?.id));
  if (ids.has('quality_unreliable')) return 2;
  if (ids.has('quality_reliable')) return 0.5;
  return 1;
};

/** Applies wear for spent ammunition. One spent round counts as one shot. */
export const applyWeaponWear = (weapon, ammoSpent, baseLossPer10Shots) => {
  const spent = Math.max(0, Math.floor(Number(ammoSpent) || 0));
  const baseLoss = clamp(Math.floor(Number(baseLossPer10Shots) || 1), 1, 100);
  const ammoRemainder = Math.max(0, Math.floor(Number(weapon?.durabilityAmmoRemainder) || 0));
  const fullTens = Math.floor((ammoRemainder + spent) / 10);
  const nextAmmoRemainder = (ammoRemainder + spent) % 10;
  const pendingWear = Math.max(0, Number(weapon?.durabilityWearRemainder) || 0)
    + fullTens * baseLoss * getDurabilityMultiplier(weapon?.qualities);
  const loss = Math.floor(pendingWear);

  return {
    durability: clamp(Math.floor(Number(weapon?.durability) || 0) - loss, 0, 100),
    durabilityAmmoRemainder: nextAmmoRemainder,
    durabilityWearRemainder: pendingWear - loss,
  };
};

export const repairWeaponDurability = () => ({
  durability: 100,
  durabilityAmmoRemainder: 0,
  durabilityWearRemainder: 0,
});
