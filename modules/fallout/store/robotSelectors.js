import { getSettingService } from '../../../domain/registry.js';
import { getFalloutRobotState } from './robotState.js';

const EMPTY_ROBOT_STATE = Object.freeze({
  bodyPlan: null,
  slots: Object.freeze({}),
  modules: Object.freeze([]),
  mk2Installed: false,
});

const getRobotEquipmentFeature = () =>
  getSettingService('inventory')?.features?.robotEquipment ?? null;

export const selectFalloutRobotState = (state) =>
  getFalloutRobotState(state) ?? EMPTY_ROBOT_STATE;

export const selectRobotSlots = (state) => selectFalloutRobotState(state).slots || {};
export const selectRobotModules = (state) => selectFalloutRobotState(state).modules || [];
export const selectRobotBodyPlan = (state) => selectFalloutRobotState(state).bodyPlan ?? null;
export const selectRobotMk2Installed = (state) => selectFalloutRobotState(state).mk2Installed === true;
export const selectRobotSlotKeysOrdered = (state) =>
  getRobotEquipmentFeature()?.getRobotSlotKeys?.(selectRobotBodyPlan(state)) ?? [];
export const selectRobotWeapons = (state) =>
  getRobotEquipmentFeature()?.getBuiltinWeaponsFromSlots?.(selectRobotSlots(state)) ?? [];
