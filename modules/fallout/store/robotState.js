import { deserializeSlot, isSlimSlot } from '../logic/robotSlots.js';

export const FALLOUT_ROBOT_STATE_EXTENSION_KEY = 'robot';

export const createInitialFalloutRobotState = () => ({
  bodyPlan: null,
  slots: {},
  modules: [],
  mk2Installed: false,
});

export const hydrateFalloutRobotState = (value) => {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawSlots = state.slots && typeof state.slots === 'object' && !Array.isArray(state.slots)
    ? state.slots
    : {};
  const slots = Object.fromEntries(Object.entries(rawSlots).map(([slotKey, slotData]) => [
    slotKey,
    isSlimSlot(slotData) ? deserializeSlot(slotData) : slotData,
  ]));
  return {
    ...createInitialFalloutRobotState(),
    ...state,
    bodyPlan: state.bodyPlan ?? null,
    slots,
    modules: Array.isArray(state.modules) ? state.modules : [],
    mk2Installed: state.mk2Installed === true,
  };
};

export const getFalloutRobotState = (state) =>
  state?.stateExtensions?.[FALLOUT_ROBOT_STATE_EXTENSION_KEY] ?? null;
