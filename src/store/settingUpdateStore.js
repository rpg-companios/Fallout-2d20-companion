// Состояние обновлений сеттингов по сети.
//
// Правила «есть ли новая версия» — в src/engine/settings/settingRelease.js,
// скачивание — в settingReleaseClient.js, установка — в settingPackStore.
// Здесь только: когда проверяли, что нашли, что установили, и защита от
// повторного предложения одной и той же версии.
//
// Приложение не знает ни одного сеттинга заранее: источники обновлений —
// это ссылки, которые пользователь добавил сам (или пустой список).
// Сеттинг без источника (локально собранный `.trpg`) просто не обновляется
// по сети — это не ошибка.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import releaseSourcesConfig from '../../settings/release-sources.json';
import {
  normalizeReleaseSource,
  planSettingUpdate,
  shouldCheckRelease,
} from '../engine/settings/settingRelease';
import {
  downloadSettingRelease,
  fetchSettingReleaseIndex,
  verifySettingRelease,
} from '../engine/settings/settingReleaseClient';
import { ENGINE_VERSION } from '../engine/version';
import useSettingPackStore from './settingPackStore';

const CHECK_INTERVAL_HOURS = Number(releaseSourcesConfig?.defaults?.checkIntervalHours) || 6;

/** Источник, добавленный пользователем: репозиторий без привязки к id. */
const normalizeStoredSource = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.repository !== 'string' || !raw.repository.includes('/')) return null;
  return {
    id: null,
    repository: raw.repository,
    branch: typeof raw.branch === 'string' && raw.branch ? raw.branch : 'main',
    autoInstall: raw.autoInstall === true,
  };
};

/**
 * Источники обновлений: пустой список по умолчанию плюс то, что добавил
 * пользователь ссылкой. Битая запись — пропуск, а не падение.
 */
export const listReleaseSources = () => {
  const configured = releaseSourcesConfig?.settings ?? {};
  const sources = [];
  for (const [settingId, raw] of Object.entries(configured)) {
    try {
      sources.push(normalizeReleaseSource(settingId, raw));
    } catch {
      // Битая запись в конфиге не должна мешать остальным сеттингам.
    }
  }
  const stored = useSettingUpdateStore.getState().sources ?? [];
  for (const raw of stored) {
    const source = normalizeStoredSource(raw);
    if (source && !sources.some((item) => item.repository === source.repository)) {
      sources.push(source);
    }
  }
  return sources;
};

const useSettingUpdateStore = create(
  persist(
    (set, get) => ({
      hydrated: false,
      status: 'idle',
      error: null,
      lastCheckedAt: 0,
      // Ссылки на репозитории сеттингов, добавленные пользователем.
      sources: [],
      // id → план обновления (status: 'update-available')
      plans: {},
      // id → версия, от которой пользователь отказался
      dismissed: {},
      installingId: null,

      setHydrated: (hydrated) => set({ hydrated }),

      /** Добавить источник обновлений ссылкой (`owner/repo` или адрес GitHub). */
      addSource: (parsed) => {
        if (!parsed || typeof parsed.repository !== 'string') {
          throw new Error('[setting-update] a release source needs a repository');
        }
        const next = {
          repository: parsed.repository,
          branch: typeof parsed.branch === 'string' && parsed.branch ? parsed.branch : 'main',
        };
        set((state) => {
          const exists = state.sources.some(
            (item) => item.repository === next.repository && item.branch === next.branch,
          );
          return { sources: exists ? state.sources : [...state.sources, next] };
        });
        return next;
      },

      /** Забыть источник: сеттинг остаётся установленным, но не обновляется. */
      removeSource: (repository) => set((state) => ({
        sources: state.sources.filter((item) => item.repository !== repository),
      })),

      /**
       * Проверить все установленные сеттинги, у которых объявлен источник.
       * Возвращает планы, требующие установки (отклонённые не возвращаются,
       * если проверка не принудительная).
       */
      checkForUpdates: async ({ force = false, fetchImpl = fetch, now = Date.now() } = {}) => {
        const sources = listReleaseSources();
        if (sources.length === 0) {
          set({ status: 'idle', error: null });
          return [];
        }
        if (!shouldCheckRelease({
          lastCheckedAt: get().lastCheckedAt,
          now,
          intervalHours: CHECK_INTERVAL_HOURS,
          force,
        })) {
          return Object.values(get().plans);
        }

        const installed = useSettingPackStore.getState().installed;
        const byId = new Map(installed.map((entry) => [entry.id, entry]));
        // Приложение не несёт сеттинг внутри: пока пакет не установлен,
        // релиз — это предложение поставить сеттинг впервые (версия 0).
        const applicable = sources;

        set({ status: 'checking', error: null });
        const found = {};
        const errors = [];

        for (const source of applicable) {
          try {
            const { index } = await fetchSettingReleaseIndex({ source, fetchImpl });
            // У источника из конфига id известен заранее; у ссылки, которую
            // добавил пользователь, — нет: берём то, что объявил release.json.
            const settingIds = source.id ? [source.id] : Object.keys(index.settings ?? {});
            for (const settingId of settingIds) {
              const plan = planSettingUpdate({
                settingId,
                source,
                index,
                installedVersion: byId.get(settingId)?.version ?? 0,
                coreVersion: ENGINE_VERSION,
              });
              if (plan.status !== 'update-available') continue;

              const dismissedVersion = get().dismissed?.[settingId];
              // Отказ от версии уважается и при ручной проверке: иначе
              // «Позже» ничего не значит. Новая версия снимает отказ.
              const sameAsDismissed = dismissedVersion != null
                && String(dismissedVersion) === String(plan.toVersion);
              if (sameAsDismissed) continue;

              found[settingId] = {
                ...plan,
                installed: byId.has(settingId),
                repository: source.repository,
                autoInstall: source.autoInstall === true,
              };
            }
          } catch (error) {
            errors.push({ settingId: source.id ?? source.repository, message: error?.message ?? String(error) });
          }
        }

        set({
          status: errors.length > 0 && Object.keys(found).length === 0 ? 'error' : 'idle',
          error: errors.length > 0 ? errors[0].message : null,
          lastCheckedAt: now,
          plans: found,
        });
        return Object.values(found);
      },

      /** Скачать и установить обновление; активный сеттинг сразу перезапускается. */
      installUpdate: async (settingId, { fetchImpl = fetch } = {}) => {
        const plan = get().plans[settingId];
        if (!plan?.release) {
          throw new Error(`[setting-update] no pending update for "${settingId}"`);
        }
        set({ installingId: settingId, error: null });
        try {
          const downloaded = await downloadSettingRelease({ release: plan.release, fetchImpl });
          await verifySettingRelease(downloaded.bytes, plan.release);

          const packStore = useSettingPackStore.getState();
          // Активного сеттинга нет — приложение работает без правил, поэтому
          // первый же установленный пакет становится активным.
          const wasActive = packStore.activeId === settingId || packStore.activeId == null;
          await packStore.installLocalPackage({
            name: plan.release.asset,
            bytes: downloaded.bytes,
          });
          if (wasActive) {
            await useSettingPackStore.getState().selectSetting(settingId);
          }

          set((state) => {
            const plans = { ...state.plans };
            delete plans[settingId];
            return {
              plans,
              installingId: null,
              lastCheckedAt: Date.now(),
            };
          });
          return { version: plan.release.version };
        } catch (error) {
          set({ installingId: null, error: error?.message ?? String(error) });
          throw error;
        }
      },

      /** «Позже»: ту же версию повторно не предлагаем до следующего релиза. */
      dismissUpdate: (settingId) => {
        const plan = get().plans[settingId];
        if (!plan) return;
        set((state) => {
          const plans = { ...state.plans };
          delete plans[settingId];
          return {
            plans,
            dismissed: { ...state.dismissed, [settingId]: String(plan.toVersion) },
          };
        });
      },
    }),
    {
      name: 'setting-updates',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sources: state.sources,
        lastCheckedAt: state.lastCheckedAt,
        dismissed: state.dismissed,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export default useSettingUpdateStore;

export const selectSettingUpdatePlans = (state) => state.plans;
export const selectSettingUpdateStatus = (state) => state.status;
export const selectSettingUpdateError = (state) => state.error;
export const selectSettingInstallingId = (state) => state.installingId;
export const selectSettingUpdatesHydrated = (state) => state.hydrated;
