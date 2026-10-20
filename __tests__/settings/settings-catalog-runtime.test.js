import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveSettingRuntime } from '../../src/engine/settings/activeSettingRuntime';
import {
  ENGINE_SETTINGS,
  getAllSettings,
  getModuleSettings,
  getSettingById,
} from '../../domain/settingsCatalog';

beforeEach(() => setActiveSettingRuntime(null));
afterEach(() => setActiveSettingRuntime(null));

describe('active setting settings metadata', () => {
  it('exposes engine-only settings while no package is active', () => {
    expect(getModuleSettings()).toEqual([]);
    expect(getAllSettings()).toEqual(ENGINE_SETTINGS);
    expect(getSettingById('survivalModeEnabled')).toBeNull();
    expect(getSettingById('characterFoldersEnabled')).toMatchObject({
      id: 'characterFoldersEnabled',
      type: 'boolean',
    });
  });

  it('reads game settings declared by the active runtime package', () => {
    const setting = {
      id: 'customRuleEnabled',
      type: 'boolean',
      controlSurface: 'settings',
      sectionKey: 'custom',
      defaultValue: false,
    };
    setActiveSettingRuntime({
      id: 'custom-setting',
      manifest: {
        id: 'custom-setting',
        defaultLocale: 'en-EN',
        locales: ['en-EN'],
      },
      settings: [setting],
    });

    expect(getModuleSettings('custom-setting')).toEqual([setting]);
    expect(getSettingById('customRuleEnabled')).toEqual(setting);
    expect(getSettingById('survivalModeEnabled')).toBeNull();
  });
});
