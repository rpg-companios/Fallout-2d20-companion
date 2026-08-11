// src/store/packStore.js
// Локальное хранилище пользовательского пакета правил («свои правила»).
//
// Этап 0: стор готов, но пакет пока НЕ применяется к каталогу/загрузчикам —
// подключение пойдёт постепенно вместе с новым контентом. Загруженный файл
// переживает перезагрузку (persist), как настройки.
//
// Формат пакета (JSON):
// {
//   "id": "client-alfa",
//   "version": 1,
//   "origins": [...], "traits": [...], "equipmentKits": [...], "weapons": [...],
//   "i18n": { "ru-RU": {...}, "en-EN": {...} },
//   "overrides": { "traits": { "<id>": {...} }, ... }
// }

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const usePackStore = create(
  persist(
    (set) => ({
      pack: null, // { id, version, ...данные пакета } | null

      setPack: (pack) => {
        if (!pack || typeof pack !== 'object' || !pack.id) return;
        set({ pack });
      },

      clearPack: () => set({ pack: null }),
    }),
    {
      name: 'fallout2d20:pack',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ pack: state.pack }),
    },
  ),
);

export default usePackStore;
