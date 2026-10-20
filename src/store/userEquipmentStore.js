import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  USER_EQUIPMENT_KINDS,
  mergeUserEquipmentRecords,
  validateUserEquipmentDocument,
} from '../../domain/userEquipment.js';
import { getActiveModuleId } from '../../domain/moduleLocale.js';
import { notifyModuleCatalogChanged } from '../../i18n/locale.js';

const STORAGE_KEY = 'fallout2d20:user-equipment:v1';
const EMPTY_SETTING = Object.freeze({ weapons: [], armor: [], weaponMods: [], armorMods: [] });
const emptySetting = () => ({ weapons: [], armor: [], weaponMods: [], armorMods: [] });

const withTimestamps = (items, updatedAt) => items.map((item) => ({
  ...item,
  _updatedAt: updatedAt,
}));

const normalizeSettingData = (value = {}) => Object.fromEntries(
  USER_EQUIPMENT_KINDS.map((kind) => [kind, Array.isArray(value[kind]) ? value[kind] : []]),
);

const useUserEquipmentStore = create(
  persist(
    (set, get) => ({
      bySetting: {},
      revision: 0,
      hydrated: false,

      finishHydration: () => {
        set((state) => ({ ...state, hydrated: true, revision: state.revision + 1 }));
        notifyModuleCatalogChanged();
      },

      getSettingData: (settingId = getActiveModuleId()) =>
        normalizeSettingData(get().bySetting[settingId] || EMPTY_SETTING),

      importDocument: ({ rawText, settingId = getActiveModuleId(), expectedKind, fileName, catalog }) => {
        const validated = validateUserEquipmentDocument(rawText, {
          expectedSettingId: settingId,
          expectedKind,
          fileName,
          catalog,
        });
        if (!validated.ok) return validated;

        const now = Date.now();
        const existing = normalizeSettingData(get().bySetting[settingId] || EMPTY_SETTING);
        const imported = withTimestamps(validated.items, now);
        const nextData = {
          ...existing,
          [validated.kind]: mergeUserEquipmentRecords(existing[validated.kind], imported),
        };
        set((state) => ({
          bySetting: { ...state.bySetting, [settingId]: nextData },
          revision: state.revision + 1,
        }));
        notifyModuleCatalogChanged();
        return { ...validated, importedCount: validated.items.length, updatedAt: now };
      },

      mergeRemoteData: ({ settingId = getActiveModuleId(), remoteData = {} }) => {
        const localData = normalizeSettingData(get().bySetting[settingId] || EMPTY_SETTING);
        const merged = Object.fromEntries(USER_EQUIPMENT_KINDS.map((kind) => [
          kind,
          mergeUserEquipmentRecords(localData[kind], Array.isArray(remoteData[kind]) ? remoteData[kind] : []),
        ]));
        const changed = USER_EQUIPMENT_KINDS.some((kind) => (
          JSON.stringify(localData[kind]) !== JSON.stringify(merged[kind])
        ));
        if (changed) {
          set((state) => ({
            bySetting: { ...state.bySetting, [settingId]: merged },
            revision: state.revision + 1,
          }));
          notifyModuleCatalogChanged();
        }
        return { changed, data: merged };
      },

      exportSettingData: (settingId = getActiveModuleId()) =>
        normalizeSettingData(get().bySetting[settingId] || EMPTY_SETTING),

      clearKind: (kind, settingId = getActiveModuleId()) => {
        if (!USER_EQUIPMENT_KINDS.includes(kind)) return;
        const existing = normalizeSettingData(get().bySetting[settingId] || EMPTY_SETTING);
        set((state) => ({
          bySetting: { ...state.bySetting, [settingId]: { ...existing, [kind]: [] } },
          revision: state.revision + 1,
        }));
        notifyModuleCatalogChanged();
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({ bySetting: state.bySetting }),
      onRehydrateStorage: () => (state) => {
        state?.finishHydration?.();
      },
    },
  ),
);

export default useUserEquipmentStore;
export { EMPTY_SETTING as EMPTY_USER_EQUIPMENT_SETTING };
export const getUserEquipmentRevision = () => useUserEquipmentStore.getState().revision;
