import * as ReactModule from 'react';
import * as ActiveSettingRuntime from './activeSettingRuntime.js';
import * as ExpoVectorIcons from '@expo/vector-icons';
import * as ReactNative from 'react-native';
import * as ZustandReactShallow from 'zustand/react/shallow';
import * as AlertService from '../../../components/alerts/alertService';
import * as Database from '../../../db/Database';
import * as CurrentLocale from '../../../i18n/locale';
import * as Effects from '../../../domain/effects.js';
import * as RuntimeTrace from '../debug/runtimeTrace.js';
import * as CharacterSaves from '../../../src/saves/characterSaves';
import * as AppSettingsStore from '../../../src/store/appSettingsStore';
import * as CharacterStore from '../../../src/store/characterStore';
import * as EffectsSync from '../../../src/store/effectsSync';
import * as Resolvers from '../../../src/store/resolvers';
import * as Selectors from '../../../src/store/selectors';
import * as StateExtensions from '../../../src/store/stateExtensions';
import * as UserEquipmentStore from '../../../src/store/userEquipmentStore';
import * as UseSettingAction from '../../../src/store/useSettingAction.js';
import * as InventoryScreenComponent from '../../../components/screens/InventoryScreen/InventoryScreen.js';
import * as InventoryI18n from '../../../components/screens/InventoryScreen/logic/inventoryI18n.js';
import * as AddItemModal from '../../../components/screens/InventoryScreen/modals/AddItemModal.js';
import * as CatalogSource from '../../../db/catalogSource.js';
import * as Counters from '../../../domain/counters.js';
import * as CraftingEngine from '../../../domain/craftingEngine.js';
import * as D20Checks from '../../../domain/d20Checks.js';
import * as DeepMerge from '../../../domain/deepMerge.js';
import * as DiceRollsLogic from '../../../domain/diceRollsLogic.js';
import * as EquipEquip from '../../../domain/equipEquip.js';
import * as EquipmentKits from '../../../domain/equipmentKits.js';
import * as EquippedArmor from '../../../domain/equippedArmor.js';
import * as Immunities from '../../../domain/immunities.js';
import * as ItemfitRules from '../../../domain/itemfitRules.js';
import * as LevelBands from '../../../domain/levelBands.js';
import * as ModsEquip from '../../../domain/modsEquip.js';
import * as ModuleLocale from '../../../domain/moduleLocale.js';
import * as NumericModifier from '../../../domain/numericModifier.js';
import * as Origins from '../../../domain/origins.js';
import * as Perks from '../../../domain/perks.js';
import * as ProtectionKind from '../../../domain/protectionKind.js';
import * as Registry from '../../../domain/registry.js';
import * as ResolveItem from '../../../domain/resolveItem.js';
import * as SceneRiskChecks from '../../../domain/sceneRiskChecks.js';
import * as EquipmentCatalog from '../../../i18n/equipmentCatalog.js';
import * as WeaponMods from '../items/weaponMods';

/**
 * Stable engine modules that setting bundles may import through explicit `engine:` IDs.
 * Review additions as API surface; the runtime builder checks every emitted `engine:` id
 * against this map so a package cannot ship with an unresolved host dependency.
 */
export const SETTING_RUNTIME_HOST_MODULES = Object.freeze({
  '@expo/vector-icons': ExpoVectorIcons,
  react: ReactModule,
  'react-native': ReactNative,
  'zustand/react/shallow': ZustandReactShallow,
  'engine:components/screens/InventoryScreen/InventoryScreen': InventoryScreenComponent,
  'engine:components/screens/InventoryScreen/logic/inventoryI18n': InventoryI18n,
  'engine:components/screens/InventoryScreen/modals/AddItemModal': AddItemModal,
  'engine:db/catalogSource': CatalogSource,
  'engine:domain/counters': Counters,
  'engine:domain/craftingEngine': CraftingEngine,
  'engine:domain/d20Checks': D20Checks,
  'engine:domain/deepMerge': DeepMerge,
  'engine:domain/diceRollsLogic': DiceRollsLogic,
  'engine:domain/equipEquip': EquipEquip,
  'engine:domain/equipmentKits': EquipmentKits,
  'engine:domain/equippedArmor': EquippedArmor,
  'engine:domain/immunities': Immunities,
  'engine:domain/itemfitRules': ItemfitRules,
  'engine:domain/levelBands': LevelBands,
  'engine:domain/modsEquip': ModsEquip,
  'engine:domain/moduleLocale': ModuleLocale,
  'engine:domain/numericModifier': NumericModifier,
  'engine:domain/origins': Origins,
  'engine:domain/perks': Perks,
  'engine:domain/protectionKind': ProtectionKind,
  'engine:domain/registry': Registry,
  'engine:domain/resolveItem': ResolveItem,
  'engine:domain/sceneRiskChecks': SceneRiskChecks,
  'engine:i18n/equipmentCatalog': EquipmentCatalog,
  'engine:src/engine/items/weaponMods': WeaponMods,
  'engine:components/alerts/alertService': AlertService,
  'engine:src/engine/settings/activeSettingRuntime': ActiveSettingRuntime,
  'engine:db/Database': Database,
  'engine:i18n/locale': CurrentLocale,
  'engine:domain/effects': Effects,
  'engine:src/engine/debug/runtimeTrace': RuntimeTrace,
  'engine:src/saves/characterSaves': CharacterSaves,
  'engine:src/store/appSettingsStore': AppSettingsStore,
  'engine:src/store/characterStore': CharacterStore,
  'engine:src/store/effectsSync': EffectsSync,
  'engine:src/store/resolvers': Resolvers,
  'engine:src/store/selectors': Selectors,
  'engine:src/store/stateExtensions': StateExtensions,
  'engine:src/store/userEquipmentStore': UserEquipmentStore,
  'engine:src/store/useSettingAction': UseSettingAction,
});

export const createSettingRuntimeEngineApi = (overrides = {}) => Object.freeze({
  apiVersion: 1,
  modules: SETTING_RUNTIME_HOST_MODULES,
  ...overrides,
});
