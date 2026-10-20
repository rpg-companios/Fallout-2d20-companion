import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setActiveSettingRuntime } from '../engine/settings/activeSettingRuntime';

const SETTING_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

const normalizePersistedState = (persistedState, currentState) => {
  const persisted = persistedState && typeof persistedState === 'object'
    ? persistedState
    : {};
  const entries = Array.isArray(persisted.installed) ? persisted.installed : [];
  const installed = entries
    .filter((entry) => (
      entry
      && typeof entry.id === 'string'
      && SETTING_ID_RE.test(entry.id)
      && entry.source === 'package'
      && typeof entry.digest === 'string'
      && DIGEST_RE.test(entry.digest)
      && entry.cacheKey === `${entry.id}/${entry.digest}`
    ))
    .map((entry) => ({ ...entry, runtimeReady: false }));
  const activeId = installed.some((entry) => entry.id === persisted.activeId)
    ? persisted.activeId
    : null;

  return {
    ...currentState,
    ...persisted,
    installed,
    activeId,
    activeRuntime: null,
    activationStatus: 'idle',
    activationError: null,
    hydrated: false,
  };
};

let activationAttempt = 0;

const useSettingPackStore = create(
  persist(
    (set, get) => ({
      installed: [],
      activeId: null,
      activeRuntime: null,
      activationStatus: 'idle',
      activationError: null,
      hydrated: false,

      setHydrated: (hydrated) => set({ hydrated }),

      selectSetting: async (id) => {
        const entry = get().installed.find((item) => item.id === id);
        if (!entry) throw new Error(`[setting-store] setting "${id}" is not installed`);
        if (get().activeId === id && get().activeRuntime) return true;

        const attempt = ++activationAttempt;
        set({ activationStatus: 'loading', activationError: null });
        let settingRuntime = null;
        try {
          const [runtimeModule, hostModule] = await Promise.all([
            import('../engine/settings/settingPackageRuntime.js'),
            import('../engine/settings/settingRuntimeHost.js'),
          ]);
          const packageRuntime = await runtimeModule.openSettingPackageRuntime(entry.cacheKey);
          settingRuntime = await packageRuntime.loadModule(
            hostModule.createSettingRuntimeEngineApi({ settingId: entry.id }),
          );
          if (!Array.isArray(settingRuntime.screens) || settingRuntime.screens.length === 0) {
            throw new Error(`[setting-store] setting "${entry.id}" has no screens`);
          }
          if (attempt !== activationAttempt) {
            runtimeModule.disposeSettingPackageModule(settingRuntime);
            return false;
          }

          const previousRuntime = get().activeRuntime;
          setActiveSettingRuntime(settingRuntime);
          const appSettingsModule = await import('./appSettingsStore');
          appSettingsModule.default.getState().activateActiveModuleSettings(settingRuntime.id);
          set((state) => ({
            activeId: entry.id,
            activeRuntime: settingRuntime,
            activationStatus: 'ready',
            activationError: null,
            installed: state.installed.map((item) => (
              item.id === entry.id ? { ...item, runtimeReady: true } : item
            )),
          }));
          if (previousRuntime && previousRuntime !== settingRuntime) {
            runtimeModule.disposeSettingPackageModule(previousRuntime);
          }
          return true;
        } catch (error) {
          if (settingRuntime) {
            const { disposeSettingPackageModule } = await import('../engine/settings/settingPackageRuntime.js');
            disposeSettingPackageModule(settingRuntime);
          }
          if (attempt === activationAttempt) {
            const previousRuntime = get().activeRuntime || null;
            setActiveSettingRuntime(previousRuntime);
            set({
              activationStatus: 'error',
              activationError: error?.message || String(error),
              ...(previousRuntime ? {} : { activeId: null }),
            });
          }
          throw error;
        }
      },

      deleteSetting: async (id) => {
        const entry = get().installed.find((item) => item.id === id);
        if (!entry) return;

        if (entry.cacheKey) {
          const { deleteCachedSettingPackage } = await import('../engine/settings/settingPackageInstaller.js');
          await deleteCachedSettingPackage(entry.cacheKey);
        }

        const deletingActive = get().activeId === id;
        const activeRuntime = deletingActive ? get().activeRuntime : null;
        const installed = get().installed.filter((item) => item.id !== id);
        ++activationAttempt;
        if (deletingActive) setActiveSettingRuntime(null);
        set({
          installed,
          activeId: deletingActive ? null : get().activeId,
          activeRuntime: deletingActive ? null : get().activeRuntime,
          activationStatus: 'idle',
          activationError: null,
        });
        if (activeRuntime) {
          const { disposeSettingPackageModule } = await import('../engine/settings/settingPackageRuntime.js');
          disposeSettingPackageModule(activeRuntime);
        }
      },

      installLocalPackage: async ({ name, bytes }) => {
        const { installSettingPackage } = await import('../engine/settings/settingPackageInstaller.js');
        const installedPackage = await installSettingPackage({ name, bytes });
        const packageEntry = {
          ...installedPackage,
          source: 'package',
          runtimeReady: false,
        };
        const current = get().installed;
        const previousIndex = current.findIndex((entry) => entry.id === packageEntry.id);
        const previous = previousIndex < 0 ? null : current[previousIndex];
        const replacingActive = previous?.id === get().activeId
          && previous.cacheKey !== packageEntry.cacheKey;
        if (replacingActive && get().activeRuntime) {
          const { disposeSettingPackageModule } = await import('../engine/settings/settingPackageRuntime.js');
          disposeSettingPackageModule(get().activeRuntime);
        }
        if (replacingActive) setActiveSettingRuntime(null);
        const installed = previousIndex < 0
          ? [...current, packageEntry]
          : current.map((entry, index) => (index === previousIndex ? packageEntry : entry));
        set({
          installed,
          ...(replacingActive ? {
            activeId: null,
            activeRuntime: null,
            activationStatus: 'idle',
            activationError: null,
          } : {}),
        });

        if (previous?.source === 'package' && previous.cacheKey !== packageEntry.cacheKey) {
          try {
            const { deleteCachedSettingPackage } = await import('../engine/settings/settingPackageInstaller.js');
            await deleteCachedSettingPackage(previous.cacheKey);
          } catch {
            // The new cache is already indexed; a stale copy is reclaimable later.
          }
        }
        return packageEntry;
      },
    }),
    {
      name: 'setting-packs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        installed: state.installed,
        activeId: state.activeId,
      }),
      merge: normalizePersistedState,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export default useSettingPackStore;

export const selectInstalledSettings = (state) => state.installed;
export const selectActiveSettingId = (state) => state.activeId;
export const selectActiveSettingRuntime = (state) => state.activeRuntime;
export const selectBundledSettingActive = (state) => Boolean(state.activeRuntime);
export const selectSettingStoreHydrated = (state) => state.hydrated;
