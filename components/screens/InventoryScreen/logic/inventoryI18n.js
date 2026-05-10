import ruInventoryScreen from '../../../../i18n/ru-RU/screens/inventory/screen.json';
import enInventoryScreen from '../../../../i18n/en-EN/screens/inventory/screen.json';
import ruAddItemModal from '../../../../i18n/ru-RU/screens/inventory/modals/addItemModal.json';
import enAddItemModal from '../../../../i18n/en-EN/screens/inventory/modals/addItemModal.json';
import ruCapsModal from '../../../../i18n/ru-RU/screens/inventory/modals/capsModal.json';
import enCapsModal from '../../../../i18n/en-EN/screens/inventory/modals/capsModal.json';
import ruSellItemModal from '../../../../i18n/ru-RU/screens/inventory/modals/sellItemModal.json';
import enSellItemModal from '../../../../i18n/en-EN/screens/inventory/modals/sellItemModal.json';
import ruAddWeaponModal from '../../../../i18n/ru-RU/screens/inventory/modals/addWeaponModal.json';
import enAddWeaponModal from '../../../../i18n/en-EN/screens/inventory/modals/addWeaponModal.json';
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
      addWeaponModal: ruAddWeaponModal,
      buyItemModal: ruBuyItemModal,
    },
  },
  'en-EN': {
    screen: enInventoryScreen,
    modals: {
      addItemModal: enAddItemModal,
      capsModal: enCapsModal,
      sellItemModal: enSellItemModal,
      addWeaponModal: enAddWeaponModal,
      buyItemModal: enBuyItemModal,
    },
  },
};

const resolvePath = (source, path, fallback = '') => {
  const parts = path.split('.');
  let current = source;

  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return fallback || 'Ошибка ключа';
  }

  return current;
};

export const tInventory = (path, fallback = '') => {
  const locale = getCurrentLocale();
  const dictionary = DICTIONARIES[locale] || DICTIONARIES['ru-RU'];
  return resolvePath(dictionary, path, fallback);
};

export const formatInventoryText = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
