import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const clampLoss = (value) => Math.min(100, Math.max(1, Math.floor(Number(value) || 1)));

const useAppSettingsStore = create(
  persist(
    (set) => ({
      randomWeaponQualityEnabled: false,
      weaponDurabilityLossEnabled: false,
      weaponDurabilityLossPer10Shots: 1,
      characterFoldersEnabled: false,
      // Режим отображения карточек оружия на экране снаряжения:
      // 'cards' (по умолчанию) | 'spoilers' | 'tabs' (пока скрыт из UI).
      weaponCardsDisplayMode: 'cards',
      // Рукопашная атака (кулаки у людей / манипулятор у роботов) всегда
      // присутствует как виртуальный первый слот. Этот флаг управляет её
      // ПОКАЗОМ на экране снаряжения: скрыта — её место занимает оружие.
      unarmedAttackVisible: true,
      setCharacterFoldersEnabled: (enabled) => set({ characterFoldersEnabled: Boolean(enabled) }),
      setRandomWeaponQualityEnabled: (enabled) => set({ randomWeaponQualityEnabled: Boolean(enabled) }),
      setWeaponDurabilityLossEnabled: (enabled) => set({ weaponDurabilityLossEnabled: Boolean(enabled) }),
      setWeaponDurabilityLossPer10Shots: (value) => set({ weaponDurabilityLossPer10Shots: clampLoss(value) }),
      setWeaponCardsDisplayMode: (mode) => set({
        weaponCardsDisplayMode: ['cards', 'spoilers', 'tabs'].includes(mode) ? mode : 'cards',
      }),
      setUnarmedAttackVisible: (visible) => set({ unarmedAttackVisible: Boolean(visible) }),
    }),
    {
      name: 'fallout2d20:settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        randomWeaponQualityEnabled: state.randomWeaponQualityEnabled,
        weaponDurabilityLossEnabled: state.weaponDurabilityLossEnabled,
        characterFoldersEnabled: state.characterFoldersEnabled,
        weaponDurabilityLossPer10Shots: state.weaponDurabilityLossPer10Shots,
        weaponCardsDisplayMode: state.weaponCardsDisplayMode,
        unarmedAttackVisible: state.unarmedAttackVisible,
      }),
      migrate: (persistedState, version) => {
        // Миграция v0 -> v1: переименование randomWeaponDurabilityEnabled -> randomWeaponQualityEnabled
        if (persistedState?.randomWeaponDurabilityEnabled !== undefined) {
          const { randomWeaponDurabilityEnabled, ...rest } = persistedState;
          return {
            ...rest,
            randomWeaponQualityEnabled: Boolean(randomWeaponDurabilityEnabled),
            weaponDurabilityLossEnabled: false,
          };
        }
        return {
          ...persistedState,
          weaponDurabilityLossEnabled: persistedState?.weaponDurabilityLossEnabled ?? false,
          // Новый флаг добавляется в v1 без bump версии: старые сейвы без него
          // получают значение по умолчанию (рукопашная показана).
          unarmedAttackVisible: persistedState?.unarmedAttackVisible ?? true,
        };
      },
      version: 1,
    },
  ),
);

export default useAppSettingsStore;
