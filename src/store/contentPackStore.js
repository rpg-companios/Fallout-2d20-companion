// src/store/contentPackStore.js
// Реестр установленных пользовательских паков контента (прототип P).
// Хранилище — AsyncStorage (состояние устройства, НЕ сейв персонажа).
// Пак целиком (manifest/names/items) держится в реестре; оверлей каталога
// строится через src/itempack/runtime на каждое чтение каталога.
//
// Установка: parse → validate (общий валидатор src/itempack) → запись +
// синхронизация рантайма + инвалидация кэша catalogSource.
// Удаление: ПОЛНОЕ, без следов (закон владельца 2026-10-19) — каскад по
// всем сейвам персонажей (domain/packItems.stripPackFromSaveData), затем
// запись из реестра исчезает.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateContentPack } from '../itempack/validate';
import { buildFalloutRefs } from '../itempack/refsFallout';
import { setInstalledContentPacks, getInstalledContentPacks } from '../itempack/runtime';
import { stripPackFromSaveData } from '../../domain/packItems';
import {
  getCharactersList,
  loadCharacterById,
  updateCharacterSaveData,
} from '../../db/Database';
import { invalidateCatalogCache } from '../../db/catalogSource';

// Тестовая подмена БД (по образцу roomStore): в тестах сейвы подменяются
// памятью, чтобы не поднимать SQLite.
let dbOverride = null;
export const __setPackDbForTests = (db) => { dbOverride = db; };
const db = () => dbOverride ?? {
  list: getCharactersList,
  load: loadCharacterById,
  update: updateCharacterSaveData,
};

const syncRuntime = (packs) => {
  setInstalledContentPacks(packs);
  invalidateCatalogCache();
};

const summarize = (pack) => ({
  weapons: pack.items?.weapons?.length ?? 0,
  weaponMods: pack.items?.weaponMods?.length ?? 0,
  ammo: pack.items?.ammo?.length ?? 0,
});

const useContentPackStore = create(
  persist(
    (set, get) => ({
      packs: [],

      /** Установить пак из текста JSON. → { ok, errors?, pack? } */
      installPackText: (text) => {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          return { ok: false, errors: [{ path: '(файл)', message: `не JSON: ${e.message}` }] };
        }
        const { ok, errors } = validateContentPack(parsed, buildFalloutRefs());
        if (!ok) return { ok: false, errors };

        const normalized = {
          manifest: parsed.manifest,
          names: parsed.names ?? {},
          items: {
            weapons: parsed.items?.weapons ?? [],
            weaponMods: parsed.items?.weaponMods ?? [],
            ammo: parsed.items?.ammo ?? [],
          },
        };
        const packs = [
          ...get().packs.filter((p) => p.manifest.packId !== normalized.manifest.packId),
          normalized,
        ];
        set({ packs });
        syncRuntime(packs);
        return { ok: true, pack: normalized, summary: summarize(normalized) };
      },

      /** Сухой подсчёт следов пака по всем сейвам (для диалога удаления). */
      countPackUsage: async (packId) => {
        const api = db();
        const characters = await api.list();
        let removed = 0;
        for (const c of characters) {
          const full = await api.load(c.id);
          if (!full?.data) continue;
          removed += stripPackFromSaveData(full.data, packId).removed;
        }
        return removed;
      },

      /** Полное удаление: каскад по сейвам, затем из реестра. → число следов. */
      deletePack: async (packId) => {
        const api = db();
        const characters = await api.list();
        let removed = 0;
        for (const c of characters) {
          const full = await api.load(c.id);
          if (!full?.data) continue;
          const stripped = stripPackFromSaveData(full.data, packId);
          if (stripped.removed > 0) {
            await api.update(c.id, stripped.data);
            removed += stripped.removed;
          }
        }
        const packs = get().packs.filter((p) => p.manifest.packId !== packId);
        set({ packs });
        syncRuntime(packs);
        return removed;
      },

      /** Синхронизация рантайма с реестром (для rehydrate и тестов). */
      syncRuntimeFromState: () => syncRuntime(get().packs),
    }),
    {
      name: 'content-packs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ packs: state.packs }),
      onRehydrateStorage: () => (state) => {
        if (state) syncRuntime(state.packs);
      },
    },
  ),
);

export default useContentPackStore;

export const selectContentPacks = (state) => state.packs;
export const selectContentPackCount = (state) => state.packs.length;
// Прямой доступ к рантайму для тестов/диагностики.
export { getInstalledContentPacks };
