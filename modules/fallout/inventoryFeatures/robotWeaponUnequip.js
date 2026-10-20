export const handleFalloutRobotWeaponUnequip = (weapon, context = {}) => {
  if (weapon?.isBuiltin || weapon?.isManipulator) return { handled: true };
  if (!weapon?.sourceSlot) return { handled: false };

  const slots = context.equipmentState?.slots ?? {};
  if (slots[weapon.sourceSlot]?.heldWeapon) {
    context.setEquipmentSlots({
      ...slots,
      [weapon.sourceSlot]: { ...slots[weapon.sourceSlot], heldWeapon: null },
    });
  }

  const stackKey = weapon.stackKey || context.getStackKey(weapon);
  const stackMate = context.findUnequippedStoreItemByStackKey(stackKey);
  if (stackMate) {
    context.adjustStoreItemQuantity(stackMate.id, 1);
  } else {
    context.addNewItem({
      ...context.flattenStoreItemParams(weapon),
      itemType: context.getItemTypeId('weapon'),
      stackKey,
      equipped: false,
      quantity: 1,
    });
  }
  return { handled: true };
};

export const isFalloutRobotWeaponActionLocked = (item) => Boolean(
  item?.isBuiltin || item?.isManipulator,
);
