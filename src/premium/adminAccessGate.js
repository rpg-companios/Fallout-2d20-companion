// src/premium/adminAccessGate.js
// Единый UI- и стор-шлюз доступа к разделу Мастера («Админ») и всем его механикам (патч 474).
//
// Чистые функции и реестр фич живут в domain/premium.js (OPEN_BETA_BY_DEFAULT = true),
// а здесь собраны реактивный хук для экранов, UI-уведомление и мягкий возврат из 'gm' в 'user'.

import { useEffect, useState } from 'react';
import {
  ADMIN_FEATURE_IDS,
  ADMIN_LICENSE_ERROR,
  FEATURE_IDS,
  OPEN_BETA_BY_DEFAULT,
  activateAdminLicense,
  assertAdminFeature,
  createAdminLicenseError,
  getEntitlement,
  isAdminLicensed,
  isFeatureAvailable,
  isGmCampaignsLicensed,
  isGmEnvCombatLicensed,
  isGmLootTradeLicensed,
  resetEntitlementToDefault,
  setEntitlement,
  subscribeEntitlement,
} from '../../domain/premium';
import useAppSettingsStore from '../store/appSettingsStore';
import useUiModeStore from '../room/uiModeStore';
import { showRawAlert } from '../../components/alerts/alertService';
import { tHomeScreen } from '../../components/screens/HomeScreen/logic/homeScreenI18n';

export {
  ADMIN_FEATURE_IDS,
  ADMIN_LICENSE_ERROR,
  FEATURE_IDS,
  OPEN_BETA_BY_DEFAULT,
  activateAdminLicense,
  assertAdminFeature,
  createAdminLicenseError,
  isAdminLicensed,
  isGmCampaignsLicensed,
  isGmEnvCombatLicensed,
  isGmLootTradeLicensed,
  resetEntitlementToDefault,
  setEntitlement,
};

/** Показывает локализованное окно о том, что раздел Мастера требует лицензию. */
export const showAdminLicenseRequiredAlert = () => {
  showRawAlert({
    title: tHomeScreen('gm.licenseRequiredTitle'),
    message: tHomeScreen('gm.licenseRequiredMessage'),
  });
};

/**
 * UI-страж действия Мастера: возвращает true (и вызывает callback, если передан),
 * когда действие разрешено; если лицензии нет — показывает уведомление (если !silent)
 * и возвращает false.
 *
 * @param {string} [featureId]
 * @param {Function | { silent?: boolean }} [callbackOrOptions]
 * @param {{ silent?: boolean }} [maybeOptions]
 * @returns {boolean}
 */
export const guardAdminAction = (
  featureId,
  callbackOrOptions,
  maybeOptions = {},
) => {
  const resolvedFeatureId = featureId || FEATURE_IDS.ADMIN_ACCESS;
  const callback = typeof callbackOrOptions === 'function' ? callbackOrOptions : null;
  const options = (callbackOrOptions && typeof callbackOrOptions === 'object')
    ? callbackOrOptions
    : maybeOptions;
  const silent = Boolean(options?.silent);

  if (isAdminLicensed() && isFeatureAvailable(resolvedFeatureId)) {
    if (callback) callback();
    return true;
  }
  if (!silent) {
    showAdminLicenseRequiredAlert();
  }
  return false;
};

/**
 * Мягкий возврат в режим «Пользователь», если у пользователя в хранилище оставался
 * режим 'gm', но лицензия Мастера не активна. Сохранённые комнаты и контейнеры в БД
 * не затрагиваются и сразу снова появятся после ввода лицензии.
 */
export const enforceAdminModeEntitlement = () => {
  if (isAdminLicensed()) return false;

  let switched = false;
  const uiState = useUiModeStore.getState();
  if (uiState.tabUiMode === 'gm' || uiState.gmInspectingCharacter) {
    uiState.setTabUiMode('user');
    switched = true;
  }

  const settingsState = useAppSettingsStore.getState();
  if (settingsState.getSettingValue?.('uiMode') === 'gm') {
    settingsState.setValue('uiMode', 'user');
    switched = true;
  }
  return switched;
};

/**
 * Реактивный хук доступа к разделу Мастера для React-компонентов
 * (App, HomeScreen, SettingsModal, LootTradeScreen).
 */
export const useAdminAccess = () => {
  const [, setRevision] = useState(0);

  useEffect(() => (
    subscribeEntitlement(() => {
      setRevision((n) => n + 1);
    })
  ), []);

  return {
    entitlement: getEntitlement(),
    adminLicensed: isAdminLicensed(),
    gmCampaignsLicensed: isGmCampaignsLicensed(),
    gmLootTradeLicensed: isGmLootTradeLicensed(),
    gmEnvCombatLicensed: isGmEnvCombatLicensed(),
  };
};
