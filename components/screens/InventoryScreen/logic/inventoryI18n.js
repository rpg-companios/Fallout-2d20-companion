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
import { getCurrentLocale } from '../../../../i18n/locale';

const DICTIONARIES = {
  'ru-RU': {
    screen: ruInventoryScreen,
    modals: {
      addItemModal: ruAddItemModal,
      capsModal: ruCapsModal,
      sellItemModal: ruSellItemModal,
      buyItemModal: ruBuyItemModal,
    },
  },
  'en-EN': {
    screen: enInventoryScreen,
    modals: {
      addItemModal: enAddItemModal,
      capsModal: enCapsModal,
      sellItemModal: enSellItemModal,
      buyItemModal: enBuyItemModal,
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
  return resolvePath(DICTIONARIES[getCurrentLocale()], path);
};

export const formatInventoryText = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
