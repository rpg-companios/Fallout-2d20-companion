// The package runtime entry is the setting-owned surface loaded by the engine.
// Build scripts bundle this file to the manifest-declared CommonJS entrypoint;
// the source wallet remains intact in the .trpg as well.
import falloutSettings from './settings.json';
import { SETTING } from './index.js';
import FusionCoreChoiceModal from './screens/PowerArmor/FusionCoreChoiceModal.js';
import PowerCoreClock from './powerArmor/PowerCoreClock.js';
import InventoryScreen from 'engine:components/screens/InventoryScreen/InventoryScreen';
import CharacterScreen from './screens/CharacterScreen/CharacterScreen.js';
import EquipmentScreen from './screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';
import PerksAndTraitsScreen from './screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js';
import SurvivalClock from './survival/SurvivalClock.js';
import { activateDiseaseRankMigration } from './diseases/runtimeRegistration.js';
import { activateFalloutSaveMigrations } from './migrations/runtimeRegistration.js';
import { activateFalloutSaveStateExtensions } from './saves/stateExtensions.js';
import { activateFalloutSurvival } from './survival/runtimeRegistration.js';
import { setupRichText } from './screens/WeaponsAndArmorScreen/textUtils.js';
import { FALLOUT_RUNTIME_SERVICES } from './runtimeServices.js';
import { activateFalloutDebug } from './debug.js';

/**
 * Activate the complete Fallout setting against the host engine API.
 * Shared stores/services are resolved by the package runtime's host module map.
 */
export default function createFalloutRuntime(engineApi) {
  const disposers = [];
  try {
    disposers.push(activateFalloutDebug());
    disposers.push(setupRichText());
    disposers.push(activateFalloutSaveStateExtensions());
    disposers.push(activateFalloutSurvival());
    disposers.push(activateFalloutSaveMigrations());
    disposers.push(activateDiseaseRankMigration());
  } catch (error) {
    disposers.reverse().forEach((dispose) => dispose?.());
    throw error;
  }

  let active = true;
  return {
    id: SETTING.meta.id,
    manifest: SETTING.meta,
    setting: SETTING,
    settings: falloutSettings,
    dispose: () => {
      if (!active) return;
      active = false;
      disposers.reverse().forEach((dispose) => dispose?.());
    },
    screens: [
      { id: 'character', route: 'CharacterTab', icon: 'person', component: CharacterScreen, labelKey: 'tabs.character' },
      { id: 'equipment', route: 'EquipmentTab', icon: 'shield', component: EquipmentScreen, labelKey: 'tabs.equipment' },
      { id: 'inventory', route: 'InventoryTab', icon: 'briefcase', component: InventoryScreen, labelKey: 'tabs.inventory' },
      { id: 'perks', route: 'PerksTab', icon: 'star', component: PerksAndTraitsScreen, labelKey: 'tabs.perks' },
    ],
    globalComponents: {
      survivalClock: SurvivalClock,
      fusionCoreChoice: FusionCoreChoiceModal,
      powerCoreClock: PowerCoreClock,
    },
    services: FALLOUT_RUNTIME_SERVICES,
    engineApiVersion: engineApi?.apiVersion,
  };
}
