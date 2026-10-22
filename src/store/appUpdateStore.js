// src/store/appUpdateStore.js
// Состояние проверки обновлений самого приложения (движка).
//
// Правила «вышла ли новая версия» — в src/engine/updates/appRelease.js,
// сеть — в appReleaseClient.js. Здесь только: когда проверяли, что нашли,
// от какой версии отказались и идёт ли проверка сейчас.
//
// Проверка не влияет на запуск: нет сети, репозиторий недоступен, файла
// ещё нет (до первого релиза) — игра работает на установленной версии.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchAppRelease } from '../engine/updates/appReleaseClient';
import { planAppUpdate } from '../engine/updates/appRelease';
import { ENGINE_VERSION } from '../engine/version';

// Раз в 6 часов достаточно: релизы движка выходят реже, а при запуске
// проверка всё равно не блокирует интерфейс.
export const APP_UPDATE_CHECK_INTERVAL_HOURS = 6;

const intervalMs = APP_UPDATE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;

/** Пора ли идти в сеть: та же защита, что у обновлений сеттингов. */
export const shouldCheckAppUpdate = ({ lastCheckedAt = 0, now = Date.now(), force = false }) => (
  force === true || !lastCheckedAt || now - lastCheckedAt >= intervalMs
);

const useAppUpdateStore = create(
  persist(
    (set, get) => ({
      hydrated: false,
      status: 'idle',
      error: null,
      lastCheckedAt: 0,
      // Версия, от которой пользователь отказался кнопкой «Позже».
      dismissedVersion: null,
      // План доступного обновления: {status:'available', version, downloadUrl, pageUrl, notes}.
      plan: null,

      setHydrated: (hydrated) => set({ hydrated }),

      /**
       * Проверить, вышла ли новая версия.
       *
       * @param {object} options
       * @param {boolean} options.force           игнорировать интервал «не чаще 6 часов»
       * @param {boolean} options.includeDismissed показывать версию, отложенную «Позже»
       *                                          (ручная проверка из «О приложении»)
       * @param {Function} options.fetchImpl      подмена fetch в тестах
       * @param {number} options.now              время проверки (тесты)
       * @returns {Promise<{status: string, version?: string}>}
       */
      checkForUpdate: async ({
        force = false,
        includeDismissed = false,
        fetchImpl = fetch,
        now = Date.now(),
      } = {}) => {
        if (!shouldCheckAppUpdate({ lastCheckedAt: get().lastCheckedAt, now, force })) {
          return get().plan ?? { status: 'current' };
        }

        set({ status: 'checking', error: null });
        try {
          const { release } = await fetchAppRelease({ fetchImpl });
          const plan = planAppUpdate({
            latest: release,
            currentVersion: ENGINE_VERSION,
            dismissedVersion: includeDismissed ? null : get().dismissedVersion,
          });
          set({
            status: 'idle',
            error: null,
            lastCheckedAt: now,
            plan: plan.status === 'available' ? plan : null,
          });
          return plan;
        } catch (error) {
          // Сеть/формат — не ошибка пользователя: просто пробуем позже.
          set({
            status: 'error',
            error: error?.message ?? String(error),
            lastCheckedAt: now,
            plan: null,
          });
          return { status: 'error' };
        }
      },

      /** «Позже»: эту версию повторно не предлагаем, следующая — снова. */
      dismissUpdate: () => {
        const plan = get().plan;
        if (!plan?.version) return;
        set({ plan: null, dismissedVersion: String(plan.version) });
      },

      /** Окно закрыто по действию пользователя (скачал/обновил) — снимаем план. */
      clearPlan: () => set({ plan: null }),
    }),
    {
      name: 'app-updates',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastCheckedAt: state.lastCheckedAt,
        dismissedVersion: state.dismissedVersion,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export default useAppUpdateStore;

export const selectAppUpdatePlan = (state) => state.plan;
export const selectAppUpdateStatus = (state) => state.status;
export const selectAppUpdateError = (state) => state.error;
export const selectAppUpdateLastCheckedAt = (state) => state.lastCheckedAt;
export const selectAppUpdatesHydrated = (state) => state.hydrated;
