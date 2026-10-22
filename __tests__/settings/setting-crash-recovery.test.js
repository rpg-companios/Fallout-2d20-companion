import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { loadSettingModule, disposeSettingPackageModule, createSettingRuntimeEngineApi } = vi.hoisted(() => ({
  loadSettingModule: vi.fn(async () => ({
    id: 'custom_setting',
    settings: [],
    screens: [{ id: 'character', route: 'CharacterTab', component: () => null }],
  })),
  disposeSettingPackageModule: vi.fn(),
  createSettingRuntimeEngineApi: vi.fn((overrides) => ({ apiVersion: 1, ...overrides })),
}));

vi.mock('../../src/engine/settings/settingPackageRuntime.js', () => ({
  openSettingPackageRuntime: vi.fn(async () => ({ loadModule: loadSettingModule })),
  disposeSettingPackageModule,
}));
vi.mock('../../src/engine/settings/settingRuntimeHost.js', () => ({
  createSettingRuntimeEngineApi,
}));
// Module settings are a separate engine concern; activation here must not
// depend on the real registry.
vi.mock('../../src/store/appSettingsStore', () => ({
  default: { getState: () => ({ activateActiveModuleSettings: () => {} }) },
}));

import useSettingPackStore from '../../src/store/settingPackStore';
import { setActiveSettingRuntime } from '../../src/engine/settings/activeSettingRuntime';

const DIGEST = 'a'.repeat(64);
const ENTRY = {
  id: 'custom_setting',
  name: 'Custom Setting',
  version: '1.0.0',
  digest: DIGEST,
  cacheKey: `custom_setting/${DIGEST}`,
  runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
  source: 'package',
  runtimeReady: false,
};

const resetStore = () => useSettingPackStore.setState({
  installed: [ENTRY],
  activeId: null,
  activeRuntime: null,
  activationStatus: 'idle',
  activationError: null,
  activationGuard: null,
  hydrated: true,
});

describe('setting crash recovery', () => {
  beforeEach(async () => {
    setActiveSettingRuntime(null);
    await AsyncStorage.clear();
    resetStore();
    disposeSettingPackageModule.mockClear();
  });

  it('writes a guard before the runtime becomes visible', async () => {
    await useSettingPackStore.getState().selectSetting('custom_setting');

    const state = useSettingPackStore.getState();
    expect(state.activeId).toBe('custom_setting');
    expect(state.activationGuard).toEqual({ id: 'custom_setting', at: expect.any(Number) });
  });

  it('confirmActivation clears the guard after a healthy render window', async () => {
    await useSettingPackStore.getState().selectSetting('custom_setting');
    useSettingPackStore.getState().confirmActivation();

    const state = useSettingPackStore.getState();
    expect(state.activationGuard).toBeNull();
    expect(state.activeId).toBe('custom_setting');
    expect(state.activeRuntime).not.toBeNull();
  });

  it('disableBrokenSetting leaves the engine running and forgets the active package', async () => {
    await useSettingPackStore.getState().selectSetting('custom_setting');
    const runtime = useSettingPackStore.getState().activeRuntime;

    await useSettingPackStore.getState().disableBrokenSetting({ reason: 'Object is not a function' });

    const state = useSettingPackStore.getState();
    expect(state.activeId).toBeNull();
    expect(state.activeRuntime).toBeNull();
    expect(state.activationGuard).toBeNull();
    expect(state.activationStatus).toBe('error');
    expect(state.activationError).toBe('Object is not a function');
    expect(state.installed[0].runtimeReady).toBe(false);
    expect(disposeSettingPackageModule).toHaveBeenCalledWith(runtime);
  });

  it('keeps a persisted guard so the next launch skips a suspicious package', async () => {
    await AsyncStorage.setItem('setting-packs', JSON.stringify({
      state: {
        installed: [ENTRY],
        activeId: 'custom_setting',
        activationGuard: { id: 'custom_setting', at: 123 },
      },
      version: 0,
    }));

    await useSettingPackStore.persist.rehydrate();

    const state = useSettingPackStore.getState();
    expect(state.activeId).toBe('custom_setting');
    expect(state.activationGuard).toEqual({ id: 'custom_setting', at: 123 });
  });

  it('drops a malformed persisted guard', async () => {
    await AsyncStorage.setItem('setting-packs', JSON.stringify({
      state: {
        installed: [ENTRY],
        activeId: 'custom_setting',
        activationGuard: { id: '../escape', at: 'soon' },
      },
      version: 0,
    }));

    await useSettingPackStore.persist.rehydrate();

    expect(useSettingPackStore.getState().activationGuard).toBeNull();
  });
});
