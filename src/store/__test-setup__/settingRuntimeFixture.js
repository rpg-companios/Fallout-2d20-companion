// Test-only bootstrap: legacy domain suites exercise Fallout mechanics directly.
// Production starts with no active package; package activation is explicit in App.
import { SETTING_MANIFEST } from '../../../modules/fallout/manifest.js';
import { SETTING } from '../../../modules/fallout/index.js';
import falloutSettings from '../../../modules/fallout/settings.json';
import { FALLOUT_RUNTIME_SERVICES } from '../../../modules/fallout/runtimeServices.js';
import { activateFalloutSaveMigrations } from '../../../modules/fallout/migrations/runtimeRegistration.js';
import { activateFalloutSaveStateExtensions } from '../../../modules/fallout/saves/stateExtensions.js';
import { setActiveSettingRuntime } from '../../engine/settings/activeSettingRuntime';
import useCharacterStore from '../characterStore.js';

setActiveSettingRuntime({
  id: SETTING_MANIFEST.id,
  manifest: SETTING_MANIFEST,
  setting: SETTING,
  settings: falloutSettings,
  services: FALLOUT_RUNTIME_SERVICES,
});
activateFalloutSaveMigrations();
activateFalloutSaveStateExtensions();
useCharacterStore.getState().initializeCharacterCreationDefaults();
