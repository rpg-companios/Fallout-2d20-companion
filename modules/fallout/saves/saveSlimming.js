import { deserializeSlot, isSlimSlot, serializeSlot } from '../logic/robotSlots.js';

/**
 * Traverse Fallout-owned item containers while the generic engine applies its
 * catalog projection/restoration callback to each contained item.
 */
export const mapFalloutItemContainers = (data, mapItem) => {
  if (!data || typeof data !== 'object') return data;
  const next = { ...data };

  const equippedPowerArmor = next.equippedPowerArmor;
  if (equippedPowerArmor && typeof equippedPowerArmor === 'object') {
    const mapped = { ...equippedPowerArmor };
    if (mapped.frame) mapped.frame = mapItem(mapped.frame);
    if (mapped.pieces && typeof mapped.pieces === 'object') {
      mapped.pieces = Object.fromEntries(Object.entries(mapped.pieces)
        .map(([slot, piece]) => [slot, mapItem(piece)]));
    }
    next.equippedPowerArmor = mapped;
  }

  const equippedRobotSlots = next.equippedRobotSlots;
  if (equippedRobotSlots && typeof equippedRobotSlots === 'object') {
    next.equippedRobotSlots = Object.fromEntries(Object.entries(equippedRobotSlots)
      .map(([slotKey, slot]) => {
        if (!slot || typeof slot !== 'object') return [slotKey, slot];
        const normalized = isSlimSlot(slot) ? deserializeSlot(slot) : { ...slot };
        if (normalized.limb) normalized.limb = mapItem(normalized.limb);
        if (normalized.armor) normalized.armor = mapItem(normalized.armor);
        if (normalized.plating) normalized.plating = mapItem(normalized.plating);
        if (normalized.frame) normalized.frame = mapItem(normalized.frame);
        if (normalized.heldWeapon) normalized.heldWeapon = mapItem(normalized.heldWeapon);
        return [slotKey, normalized];
      }));
  }

  return next;
};

/**
 * Keep Fallout's existing compact robot-slot save representation. This is a
 * post-projection step so item instances inside a slot are first normalized by
 * the shared catalog resolver.
 */
export const slimFalloutSettingContainers = (data) => {
  if (!data || typeof data !== 'object' || !data.equippedRobotSlots
      || typeof data.equippedRobotSlots !== 'object') {
    return data;
  }
  const slots = Object.fromEntries(Object.entries(data.equippedRobotSlots)
    .map(([slotKey, slot]) => [
      slotKey,
      slot && typeof slot === 'object' ? serializeSlot(slot) : slot,
    ]));
  return { ...data, equippedRobotSlots: slots };
};
