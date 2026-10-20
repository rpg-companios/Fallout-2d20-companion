import useCharacterStore from './characterStore.js';

/** Select a stable action supplied by an active setting feature. */
export const useSettingAction = (featureId, actionId) => useCharacterStore(
  (state) => state.getSettingAction(featureId, actionId),
);
