// Fallout robot-specific inventory interpretation consumed by the shared screen.
export const isFalloutRobotLimbItem = (item) => {
  const itemType = item?.itemType;
  if (['robotArm', 'robotHead', 'robotBody', 'robotLeg'].includes(itemType)) return true;
  return item?.itemCategory === 'limb' || item?.itemCategory === 'weaponAsLimb';
};

export const getFalloutRobotBodyConfiguration = (origin, inventoryItems = [], catalog = {}) => {
  const bodyPart = inventoryItems.find((item) => (
    String(item?.id || '').startsWith('robot_body_') || item?.itemType === 'robotPart'
  )) || null;
  const bodyPlan = origin?.bodyPlan || bodyPart?.robotBodyPlan || null;
  const upgrades = Array.isArray(catalog?.robotPartsUpgrade) ? catalog.robotPartsUpgrade : [];
  return {
    bodyPlan,
    upgrade: bodyPlan
      ? (upgrades.find((part) => part?.robotBodyPlan === bodyPlan) || null)
      : null,
  };
};

export const isFalloutRobotOnlyItem = (item, catalog = {}) => Boolean(
  item?.id && (catalog?.robotWeapons || []).some((entry) => entry?.id === item.id),
);

export const getFalloutRobotArmForWeapon = (item, catalog = {}) => {
  if (!item?.id) return null;
  return (catalog?.robotArms || []).find((entry) => entry?.id === item.id) || null;
};

export const hasFalloutRobotWeaponHoldingLimb = (slots = {}) =>
  Object.values(slots || {}).some((slotData) => slotData?.limb?.canHoldWeapons === true);
