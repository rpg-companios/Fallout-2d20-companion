// Generic equipment-layer state and optional setting-owned protection rules.
import { getSettingService } from './registry.js';

/** Empty shared body-layer map used by characters without equipped protection. */
export const createEmptyEquippedArmor = () => ({
  head: { armor: null, clothing: null },
  body: { armor: null, clothing: null },
  leftArm: { armor: null, clothing: null },
  rightArm: { armor: null, clothing: null },
  leftLeg: { armor: null, clothing: null },
  rightLeg: { armor: null, clothing: null },
});

const getEligibility = () =>
  getSettingService('inventory')?.features?.equipmentEligibility ?? null;

export const resolveTargetLayer = (item) => {
  const resolve = getEligibility()?.resolveProtectionLayer;
  return typeof resolve === 'function' ? (resolve(item) ?? null) : null;
};

export const blocksArmorOver = (item) => {
  const blocks = getEligibility()?.blocksArmorOverlay;
  return typeof blocks === 'function' && Boolean(blocks(item));
};
