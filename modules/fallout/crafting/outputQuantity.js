// Fallout recipe output quantity syntax: integer or { base, cd }.

/** Validate the setting-owned quantity payload without rolling dice. */
export const assertFalloutOutputQuantity = (quantity) => {
  if (Number.isInteger(quantity)) {
    if (quantity < 1) throw new Error('[falloutCrafting] output quantity must be >= 1');
    return;
  }
  if (!quantity || typeof quantity !== 'object' || Array.isArray(quantity)) {
    throw new Error('[falloutCrafting] output quantity must be an integer or { base, cd }');
  }
  const base = Number(quantity.base);
  const cd = Number(quantity.cd ?? 0);
  if (!Number.isInteger(base) || base < 1) {
    throw new Error('[falloutCrafting] output quantity base must be an integer >= 1');
  }
  if (!Number.isInteger(cd) || cd < 0) {
    throw new Error('[falloutCrafting] output quantity cd must be an integer >= 0');
  }
};

/** Resolve Fallout's combat-dice output formula through the caller's dice port. */
export const resolveFalloutOutputQuantity = (quantity, rollCD) => {
  assertFalloutOutputQuantity(quantity);
  if (Number.isInteger(quantity)) return quantity;
  const base = Number(quantity.base);
  const cd = Number(quantity.cd ?? 0);
  if (cd === 0) return base;
  if (typeof rollCD !== 'function') {
    throw new Error('[falloutCrafting] rollCD port is required for CD quantities');
  }
  const rolled = Number(rollCD(cd));
  if (!Number.isInteger(rolled) || rolled < 0) {
    throw new Error('[falloutCrafting] rollCD must return a non-negative integer');
  }
  return base + rolled;
};
