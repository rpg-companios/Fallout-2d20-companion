// Lightweight public metadata doorway for this setting package.
// Consumers that only need locale/version information should not import the
// full setting catalog (index.js), because that catalog also loads rule code.
import rawManifest from './manifest.json';
import { validateSettingManifest } from '../../src/engine/contracts/settingManifest';

export const SETTING_MANIFEST = validateSettingManifest(rawManifest);
