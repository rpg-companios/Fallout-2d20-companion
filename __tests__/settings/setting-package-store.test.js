import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { installSettingPackage, deleteCachedSettingPackage, loadSettingModule, disposeSettingPackageModule, createSettingRuntimeEngineApi } = vi.hoisted(() => ({
  installSettingPackage: vi.fn(async ({ name }) => ({
    id: 'custom_setting',
    name: 'Custom Setting',
    version: '1.0.0',
    digest: 'a'.repeat(64),
    cacheKey: `custom_setting/${'a'.repeat(64)}`,
    runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
    sourceFileName: name,
  })),
  deleteCachedSettingPackage: vi.fn(async () => {}),
  loadSettingModule: vi.fn(async () => ({
    id: 'custom_setting',
    manifest: {
      id: 'custom_setting', name: 'Custom Setting', version: 1,
      defaultLocale: 'ru-RU', locales: ['ru-RU'],
    },
    settings: [],
    screens: [{ id: 'character', route: 'CharacterTab', component: () => null }],
  })),
  disposeSettingPackageModule: vi.fn(),
  createSettingRuntimeEngineApi: vi.fn((overrides) => ({ apiVersion: 1, ...overrides })),
}));

vi.mock('../../src/engine/settings/settingPackageInstaller.js', () => ({
  installSettingPackage,
  deleteCachedSettingPackage,
}));
vi.mock('../../src/engine/settings/settingPackageRuntime.js', () => ({
  openSettingPackageRuntime: vi.fn(async () => ({ loadModule: loadSettingModule })),
  disposeSettingPackageModule,
}));
vi.mock('../../src/engine/settings/settingRuntimeHost.js', () => ({
  createSettingRuntimeEngineApi,
}));

import useSettingPackStore from '../../src/store/settingPackStore';
import { setActiveSettingRuntime } from '../../src/engine/settings/activeSettingRuntime';

const resetStore = () => useSettingPackStore.setState({
  installed: [],
  activeId: null,
  activeRuntime: null,
  activationStatus: 'idle',
  activationError: null,
  hydrated: false,
});

describe('setting package store', () => {
  beforeEach(async () => {
    setActiveSettingRuntime(null);
    await AsyncStorage.clear();
    resetStore();
    installSettingPackage.mockClear();
    deleteCachedSettingPackage.mockClear();
    loadSettingModule.mockClear();
    disposeSettingPackageModule.mockClear();
    createSettingRuntimeEngineApi.mockClear();
  });

  it('starts empty, installs a cached package, then explicitly loads it on selection', async () => {
    expect(useSettingPackStore.getState().installed).toEqual([]);
    expect(useSettingPackStore.getState().activeId).toBeNull();

    const entry = await useSettingPackStore.getState().installLocalPackage({
      name: 'custom.trpg',
      bytes: new Uint8Array([1]),
    });

    expect(entry).toMatchObject({
      id: 'custom_setting',
      source: 'package',
      runtimeReady: false,
      runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
    });
    expect(useSettingPackStore.getState().activeId).toBeNull();

    await useSettingPackStore.getState().selectSetting('custom_setting');
    expect(loadSettingModule).toHaveBeenCalledTimes(1);
    expect(createSettingRuntimeEngineApi).toHaveBeenCalledWith({ settingId: 'custom_setting' });
    expect(useSettingPackStore.getState()).toMatchObject({
      activeId: 'custom_setting',
      activationStatus: 'ready',
      installed: [{ id: 'custom_setting', runtimeReady: true }],
    });
    expect(useSettingPackStore.getState().activeRuntime.id).toBe('custom_setting');
  });

  it('leaves the setting inactive when runtime loading fails', async () => {
    loadSettingModule.mockRejectedValueOnce(new Error('bundle error'));
    await useSettingPackStore.getState().installLocalPackage({
      name: 'custom.trpg',
      bytes: new Uint8Array([1]),
    });

    await expect(useSettingPackStore.getState().selectSetting('custom_setting'))
      .rejects.toThrow('bundle error');
    expect(useSettingPackStore.getState()).toMatchObject({
      activeId: null,
      activeRuntime: null,
      activationStatus: 'error',
    });
  });

  it('removes the local package cache before removing its installed record', async () => {
    await useSettingPackStore.getState().installLocalPackage({
      name: 'custom.trpg',
      bytes: new Uint8Array([1]),
    });
    const cacheKey = useSettingPackStore.getState().installed[0].cacheKey;

    await useSettingPackStore.getState().deleteSetting('custom_setting');

    expect(deleteCachedSettingPackage).toHaveBeenCalledWith(cacheKey);
    expect(useSettingPackStore.getState().installed).toEqual([]);
    expect(useSettingPackStore.getState().activeId).toBeNull();
  });

  it('replaces a same-id update only after caching it and reclaims the old cache key', async () => {
    const oldDigest = 'a'.repeat(64);
    const newDigest = 'c'.repeat(64);
    installSettingPackage
      .mockResolvedValueOnce({
        id: 'custom_setting', name: 'Custom Setting', version: '1.0.0',
        digest: oldDigest, cacheKey: `custom_setting/${oldDigest}`,
        runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
      })
      .mockResolvedValueOnce({
        id: 'custom_setting', name: 'Custom Setting', version: '2.0.0',
        digest: newDigest, cacheKey: `custom_setting/${newDigest}`,
        runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
      });

    await useSettingPackStore.getState().installLocalPackage({ name: 'v1.trpg', bytes: new Uint8Array([1]) });
    await useSettingPackStore.getState().installLocalPackage({ name: 'v2.trpg', bytes: new Uint8Array([2]) });

    expect(useSettingPackStore.getState().installed).toHaveLength(1);
    expect(useSettingPackStore.getState().installed[0])
      .toMatchObject({ version: '2.0.0', runtimeReady: false });
    expect(deleteCachedSettingPackage).toHaveBeenCalledWith(`custom_setting/${oldDigest}`);
  });

  it('keeps a persisted package selected for reactivation but does not persist loaded code', async () => {
    const digest = 'b'.repeat(64);
    await AsyncStorage.setItem('setting-packs', JSON.stringify({
      state: {
        activeId: 'custom_setting',
        installed: [
          {
            id: 'custom_setting',
            name: 'Custom Setting',
            source: 'package',
            cacheKey: `custom_setting/${digest}`,
            digest,
            runtime: { apiVersion: 1, entry: 'runtime/setting.cjs' },
            runtimeReady: true,
          },
          { id: 'file:old.trpg', name: 'Old fake row', source: 'file' },
        ],
      },
      version: 0,
    }));
    await useSettingPackStore.persist.rehydrate();

    const state = useSettingPackStore.getState();
    expect(state.activeId).toBe('custom_setting');
    expect(state.activeRuntime).toBeNull();
    expect(state.hydrated).toBe(true);
    expect(state.installed.find((item) => item.id === 'custom_setting')).toMatchObject({ runtimeReady: false });
    expect(state.installed.some((item) => item.id === 'file:old.trpg')).toBe(false);
  });
});
