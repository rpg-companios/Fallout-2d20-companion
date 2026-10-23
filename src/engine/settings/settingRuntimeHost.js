import * as ReactModule from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import * as ActiveSettingRuntime from './activeSettingRuntime.js';
import * as ExpoVectorIcons from '@expo/vector-icons';
import * as ReactNative from 'react-native';
import * as ZustandReactShallow from 'zustand/react/shallow';
import { hostModule } from './hostModule.js';
import * as AlertService from '../../../components/alerts/alertService';
import * as Database from '../../../db/Database';
import * as CurrentLocale from '../../../i18n/locale';
import * as Effects from '../../../domain/effects.js';
import * as RuntimeTrace from '../debug/runtimeTrace.js';
import * as SettingManifest from '../contracts/settingManifest';
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
import * as UserEquipment from '../../../domain/userEquipment.js';
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
  // Каждый модуль отдаётся фасадом hostModule(): пакет копирует его через
  // __toESM, а на Hermes такая копия теряет функции (см. hostModule.js).
  '@expo/vector-icons': hostModule(ExpoVectorIcons),
  react: hostModule(ReactModule),
  'react-native': hostModule(ReactNative),
  'react/jsx-runtime': hostModule(ReactJsxRuntime),
  'react/jsx-dev-runtime': hostModule(ReactJsxDevRuntime),
  'zustand/react/shallow': hostModule(ZustandReactShallow),
  'engine:components/screens/InventoryScreen/InventoryScreen': hostModule(InventoryScreenComponent),
  'engine:components/screens/InventoryScreen/logic/inventoryI18n': hostModule(InventoryI18n),
  'engine:components/screens/InventoryScreen/modals/AddItemModal': hostModule(AddItemModal),
  'engine:db/catalogSource': hostModule(CatalogSource),
  'engine:domain/counters': hostModule(Counters),
  'engine:domain/userEquipment': hostModule(UserEquipment),
  'engine:domain/craftingEngine': hostModule(CraftingEngine),
  'engine:domain/d20Checks': hostModule(D20Checks),
  'engine:domain/deepMerge': hostModule(DeepMerge),
  'engine:domain/diceRollsLogic': hostModule(DiceRollsLogic),
  'engine:domain/equipEquip': hostModule(EquipEquip),
  'engine:domain/equipmentKits': hostModule(EquipmentKits),
  'engine:domain/equippedArmor': hostModule(EquippedArmor),
  'engine:domain/immunities': hostModule(Immunities),
  'engine:domain/itemfitRules': hostModule(ItemfitRules),
  'engine:domain/levelBands': hostModule(LevelBands),
  'engine:domain/modsEquip': hostModule(ModsEquip),
  'engine:domain/moduleLocale': hostModule(ModuleLocale),
  'engine:domain/numericModifier': hostModule(NumericModifier),
  'engine:domain/origins': hostModule(Origins),
  'engine:domain/perks': hostModule(Perks),
  'engine:domain/protectionKind': hostModule(ProtectionKind),
  'engine:domain/registry': hostModule(Registry),
  'engine:domain/resolveItem': hostModule(ResolveItem),
  'engine:domain/sceneRiskChecks': hostModule(SceneRiskChecks),
  'engine:i18n/equipmentCatalog': hostModule(EquipmentCatalog),
  'engine:src/engine/items/weaponMods': hostModule(WeaponMods),
  'engine:components/alerts/alertService': hostModule(AlertService),
  'engine:src/engine/settings/activeSettingRuntime': hostModule(ActiveSettingRuntime),
  'engine:db/Database': hostModule(Database),
  'engine:i18n/locale': hostModule(CurrentLocale),
  'engine:domain/effects': hostModule(Effects),
  'engine:src/engine/debug/runtimeTrace': hostModule(RuntimeTrace),
  'engine:src/engine/contracts/settingManifest': hostModule(SettingManifest),
  'engine:src/saves/characterSaves': hostModule(CharacterSaves),
  'engine:src/store/appSettingsStore': hostModule(AppSettingsStore),
  'engine:src/store/characterStore': hostModule(CharacterStore),
  'engine:src/store/effectsSync': hostModule(EffectsSync),
  'engine:src/store/resolvers': hostModule(Resolvers),
  'engine:src/store/selectors': hostModule(Selectors),
  'engine:src/store/stateExtensions': hostModule(StateExtensions),
  'engine:src/store/userEquipmentStore': hostModule(UserEquipmentStore),
  'engine:src/store/useSettingAction': hostModule(UseSettingAction),
});

export const createSettingRuntimeEngineApi = (overrides = {}) => Object.freeze({
  apiVersion: 1,
  modules: SETTING_RUNTIME_HOST_MODULES,
  ...overrides,
});
