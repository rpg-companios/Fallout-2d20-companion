import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import falloutManifest from '../../modules/fallout/manifest.json';

export const VANILLA_SETTING_ID = falloutManifest.id;

export const getVanillaCatalog = () => ([
  {
    id: falloutManifest.id,
    name: falloutManifest.name,
    source: 'vanilla',
  },
]);

const vanillaEntry = () => getVanillaCatalog()[0];

const useSettingPackStore = create(
  persist(
    (set, get) => ({
      installed: [vanillaEntry()],
      activeId: VANILLA_SETTING_ID,

      selectSetting: (id) => {
        if (!get().installed.some((entry) => entry.id === id)) return;
        set({ activeId: id });
      },

      deleteSetting: (id) => {
        const installed = get().installed.filter((entry) => entry.id !== id);
        const activeId = get().activeId === id
          ? (installed[0]?.id ?? null)
          : get().activeId;
        set({ installed, activeId });
      },

      installVanilla: (id) => {
        const catalog = getVanillaCatalog().find((entry) => entry.id === id);
        if (!catalog) return;
        if (get().installed.some((entry) => entry.id === id)) {
          set({ activeId: id });
          return;
        }
        set({
          installed: [...get().installed, catalog],
          activeId: id,
        });
      },

      installLocalFile: (fileName) => {
        const id = `file:${fileName}`;
        if (get().installed.some((entry) => entry.id === id)) {
          set({ activeId: id });
          return;
        }
        set({
          installed: [
            ...get().installed,
            { id, name: fileName, source: 'file' },
          ],
          activeId: id,
        });
      },
    }),
    {
      name: 'setting-packs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        installed: state.installed,
        activeId: state.activeId,
      }),
    },
  ),
);

export default useSettingPackStore;

export const selectInstalledSettings = (state) => state.installed;
export const selectActiveSettingId = (state) => state.activeId;
export const selectBundledSettingActive = (state) => (
  state.activeId === VANILLA_SETTING_ID
);
