// Generic catalog adapter. The active setting owns catalog projection and schema.
import { getActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime.js';
import { getCurrentModuleLocale } from './locale.js';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});
// Пустой каталог до активации сеттинга: у него есть все ключи, которые читают
// экраны и общие операции, чтобы отсутствие сеттинга не выглядело крахом.
const EMPTY_EQUIPMENT_CATALOG = Object.freeze({
  weapons: EMPTY_ARRAY,
  armor: EMPTY_OBJECT,
  armorList: EMPTY_ARRAY,
  armorIndex: Object.freeze({ byId: new Map() }),
  powerArmorRaw: EMPTY_OBJECT,
  clothes: EMPTY_OBJECT,
  ammoTypes: EMPTY_ARRAY,
  qualities: EMPTY_ARRAY,
  effects: EMPTY_OBJECT,
  damageEffects: EMPTY_ARRAY,
  miscellaneous: EMPTY_ARRAY,
  chems: EMPTY_ARRAY,
  drinks: EMPTY_ARRAY,
  food: EMPTY_ARRAY,
  magazines: EMPTY_ARRAY,
  generalGoods: EMPTY_ARRAY,
  junk: EMPTY_ARRAY,
  materials: EMPTY_ARRAY,
  oddities: EMPTY_ARRAY,
  weaponMods: EMPTY_ARRAY,
  robotWeaponMods: EMPTY_ARRAY,
  robotWeaponModSlots: EMPTY_OBJECT,
  armorMods: EMPTY_ARRAY,
  uniqArmorMods: EMPTY_ARRAY,
  modsOverrides: EMPTY_OBJECT,
  armorEffects: EMPTY_OBJECT,
  robotWeaponsOnly: EMPTY_ARRAY,
  robotArms: EMPTY_ARRAY,
  robotPlating: EMPTY_ARRAY,
  robotArmorLayer: EMPTY_ARRAY,
  robotFrames: EMPTY_ARRAY,
  robotModules: EMPTY_ARRAY,
  robotItems: EMPTY_ARRAY,
  robotBody: EMPTY_ARRAY,
  robotHeads: EMPTY_ARRAY,
  robotLegs: EMPTY_ARRAY,
  equipmentKits: EMPTY_OBJECT,
});
const EMPTY_EQUIPMENT_DATA = Object.freeze({
  weapons: EMPTY_ARRAY,
  armor: EMPTY_OBJECT,
  weaponMods: EMPTY_ARRAY,
  armorMods: EMPTY_ARRAY,
  ammo: EMPTY_ARRAY,
});

const getEquipmentCatalogCapability = () => {
  const runtime = getActiveSettingRuntime();
  return runtime?.services?.catalogs?.equipment
    ?? runtime?.setting?.catalogs?.equipment
    ?? null;
};

/** Get the active setting's localized equipment catalog. */
export const getEquipmentCatalog = (locale = getCurrentModuleLocale()) => {
  const getLocalized = getEquipmentCatalogCapability()?.getLocalized;
  return typeof getLocalized === 'function'
    ? (getLocalized(locale) ?? EMPTY_EQUIPMENT_CATALOG)
    : EMPTY_EQUIPMENT_CATALOG;
};

/** Get setting-owned, locale-independent equipment mechanics data. */
export const getEquipmentData = () => {
  const getMechanics = getEquipmentCatalogCapability()?.getMechanics;
  return typeof getMechanics === 'function'
    ? (getMechanics() ?? EMPTY_EQUIPMENT_DATA)
    : EMPTY_EQUIPMENT_DATA;
};
