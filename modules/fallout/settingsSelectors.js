export const selectFalloutSettingValue = (settingId) => (state) => state.getSettingValue(settingId);

export const selectRobotArmPartsStrictReplace = (state) => (
  state.getSettingValue('robotArmPartsStrictReplace')
);
