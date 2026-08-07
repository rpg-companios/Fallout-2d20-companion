import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const clampLoss = (value) => Math.min(100, Math.max(1, Math.floor(Number(value) || 1)));

const useAppSettingsStore = create(
  persist(
    (set) => ({
      randomWeaponDurabilityEnabled: false,
      weaponDurabilityLossPer10Shots: 1,
      setRandomWeaponDurabilityEnabled: (enabled) => set({ randomWeaponDurabilityEnabled: Boolean(enabled) }),
      setWeaponDurabilityLossPer10Shots: (value) => set({ weaponDurabilityLossPer10Shots: clampLoss(value) }),
    }),
    {
      name: 'fallout2d20:settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        randomWeaponDurabilityEnabled: state.randomWeaponDurabilityEnabled,
        weaponDurabilityLossPer10Shots: state.weaponDurabilityLossPer10Shots,
      }),
    },
  ),
);

export default useAppSettingsStore;
