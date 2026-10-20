/** Fallout's Securitron Mk II driver inventory transaction. */
export const applyMk2Driver = (state, itemId) => {
  const robot = state?.robot ?? {};
  if (robot.bodyPlan !== 'securitron') {
    return { ok: false, reason: 'mk2.requiresSecuritron' };
  }
  if (robot.mk2Installed) {
    return { ok: false, reason: 'mk2.alreadyInstalled' };
  }

  const items = { ...(state.items ?? {}) };
  const item = items[itemId];
  const isDriver = item && (
    item.weaponId === 'robot_item_mk2_driver'
    || item.id === 'robot_item_mk2_driver'
  );
  if (!isDriver) return { ok: false, reason: 'mk2.noDriver' };

  const quantity = Number(item.quantity) || 1;
  if (quantity <= 1) delete items[itemId];
  else items[itemId] = { ...item, quantity: quantity - 1 };

  return {
    ok: true,
    patch: { items, robot: { ...robot, mk2Installed: true } },
  };
};

/** Optional inventory-row status/actions for the Fallout-specific robot OS upgrade. */
export const getFalloutRobotInventoryRowState = (item, { origin, robot } = {}) => {
  const mk2Installed = robot?.mk2Installed === true;
  const itemId = item?.weaponId || item?.id;
  const isDriver = itemId === 'robot_item_mk2_driver';
  const isDriverActionAvailable = Boolean(
    isDriver
    && !item?.isEquipped
    && !mk2Installed
    && origin?.id === 'securitron',
  );

  return {
    statusLabelKey: item?.requiresMkII && !mk2Installed
      ? 'screen.labels.requiresMkII'
      : null,
    actions: isDriverActionAvailable
      ? [{ id: 'fallout.robotMk2Driver', labelKey: 'screen.actions.apply' }]
      : [],
  };
};

/** Run an inventory-row action, dispatching to a stable store entry point by name. */
export const runFalloutRobotInventoryAction = (action, { storeItemId, dispatch } = {}) => {
  if (action?.id !== 'fallout.robotMk2Driver') return { handled: false };

  const result = dispatch?.('robotEquipment', 'applyMk2Driver', storeItemId);
  if (!result?.ok) {
    return {
      handled: true,
      alert: {
        titleKey: 'screen.alerts.mk2ApplyFailedTitle',
        messageKey: `screen.alerts.mk2Reason.${result?.reason || 'noDriver'}`,
      },
    };
  }
  return {
    handled: true,
    alert: {
      titleKey: 'screen.alerts.mk2AppliedTitle',
      messageKey: 'screen.alerts.mk2AppliedMessage',
    },
  };
};
