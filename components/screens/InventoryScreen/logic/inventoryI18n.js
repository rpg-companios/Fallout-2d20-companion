import ruInventoryScreen from '../../../../i18n/ru-RU/screens/inventory/screen.json';
import enInventoryScreen from '../../../../i18n/en-EN/screens/inventory/screen.json';
import ruAddItemModal from '../../../../i18n/ru-RU/screens/inventory/modals/addItemModal.json';
import enAddItemModal from '../../../../i18n/en-EN/screens/inventory/modals/addItemModal.json';
import ruCapsModal from '../../../../i18n/ru-RU/screens/inventory/modals/capsModal.json';
import enCapsModal from '../../../../i18n/en-EN/screens/inventory/modals/capsModal.json';
import ruSellItemModal from '../../../../i18n/ru-RU/screens/inventory/modals/sellItemModal.json';
import enSellItemModal from '../../../../i18n/en-EN/screens/inventory/modals/sellItemModal.json';
import ruBuyItemModal from '../../../../i18n/ru-RU/screens/inventory/modals/buyItemModal.json';
import enBuyItemModal from '../../../../i18n/en-EN/screens/inventory/modals/buyItemModal.json';
import ruSettingInventoryScreen from '../../../../modules/fallout/i18n/ru-RU/screens/inventory/screen.json';
import enSettingInventoryScreen from '../../../../modules/fallout/i18n/en-EN/screens/inventory/screen.json';
import ruSettingAddItemModal from '../../../../modules/fallout/i18n/ru-RU/screens/inventory/modals/addItemModal.json';
import enSettingAddItemModal from '../../../../modules/fallout/i18n/en-EN/screens/inventory/modals/addItemModal.json';
import ruSettingCapsModal from '../../../../modules/fallout/i18n/ru-RU/screens/inventory/modals/capsModal.json';
import enSettingCapsModal from '../../../../modules/fallout/i18n/en-EN/screens/inventory/modals/capsModal.json';
import ruSettingBuyItemModal from '../../../../modules/fallout/i18n/ru-RU/screens/inventory/modals/buyItemModal.json';
import enSettingBuyItemModal from '../../../../modules/fallout/i18n/en-EN/screens/inventory/modals/buyItemModal.json';
import { getCurrentLocale } from '../../../../i18n/locale';
import { deepMerge } from '../../../../i18n/mergeDicts';

export const INVENTORY_DICTIONARIES = {
  'ru-RU': {
    screen: deepMerge(ruInventoryScreen, ruSettingInventoryScreen),
    modals: {
      addItemModal: deepMerge(ruAddItemModal, ruSettingAddItemModal),
      capsModal: deepMerge(ruCapsModal, ruSettingCapsModal),
      sellItemModal: ruSellItemModal,
      buyItemModal: deepMerge(ruBuyItemModal, ruSettingBuyItemModal),
    },
  },
  'en-EN': {
    screen: deepMerge(enInventoryScreen, enSettingInventoryScreen),
    modals: {
      addItemModal: deepMerge(enAddItemModal, enSettingAddItemModal),
      capsModal: deepMerge(enCapsModal, enSettingCapsModal),
      sellItemModal: enSellItemModal,
      buyItemModal: deepMerge(enBuyItemModal, enSettingBuyItemModal),
    },
  },
};

const resolvePath = (source, path) => {
  let current = source;
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};

export const tInventory = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  return resolvePath(INVENTORY_DICTIONARIES[getCurrentLocale()], path);
};

export const formatInventoryText = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
