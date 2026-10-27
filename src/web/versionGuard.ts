// src/web/versionGuard.ts
// Автоматическая защита от устаревшего веб-кэша браузера (патч 454).
//
// Как работает:
// 1. В JS-бандл при сборке вшивается текущий номер патча из public/version.json
//    (bundledVersion).
// 2. При открытии вкладки и при возврате в неё (visibilitychange -> visible)
//    клиент запрашивает живой /version.json?_t=... с cache: 'no-store'.
// 3. Если версия на сервере отличается от версии работающего JS-бандла:
//    - проверяется предохранитель в sessionStorage (ровно одна перезагрузка на
//      конкретный номер версии — бесконечный цикл невозможен даже при забытом build);
//    - из Cache Storage вычищаются устаревшие HTML/JS-записи, НО сохраняются
//      неизменяемые иконочные шрифты (.ttf/.woff2), чтобы иконки не моргали;
//    - обновляется Service Worker и выполняется мягкая перезагрузка с ?_v=<version>.

import versionData from '../../public/version.json';
import { debugLog } from '../debug/falloutDebug';

export const BUNDLED_PATCH_VERSION = String(versionData?.version ?? '');
export const RELOAD_GUARD_SESSION_KEY = 'positronium_reloaded_for_version';

const FONT_URL_RE = /\.(ttf|woff2?|otf)(?:[?&]|$)/i;

export interface VersionGuardEnv {
  bundledVersion?: string;
  fetchImpl?: typeof fetch;
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  cachesApi?: CacheStorage | null;
  serviceWorker?: Pick<ServiceWorkerContainer, 'getRegistrations'> | null;
  reloadWithVersion?: (nextVersion: string) => void;
  cleanUrlParams?: () => void;
}

const isFontCacheRequest = (url: string): boolean => {
  if (FONT_URL_RE.test(url)) return true;
  try {
    const decoded = decodeURIComponent(url);
    return FONT_URL_RE.test(decoded);
  } catch {
    return false;
  }
};

/**
 * Удаляет из Cache Storage устаревшие HTML/JS/манифест-ответы, но оставляет
 * бинарники шрифтов (.ttf/.woff2), чтобы бургер-меню и иконки не качались заново.
 */
export const purgeStaleCachesPreservingFonts = async (
  cachesApi: CacheStorage | null | undefined = typeof window !== 'undefined' && 'caches' in window
    ? window.caches
    : null,
): Promise<number> => {
  if (!cachesApi) return 0;
  let removed = 0;
  try {
    const cacheNames = await cachesApi.keys();
    for (const name of cacheNames) {
      const cache = await cachesApi.open(name);
      const requests = await cache.keys();
      for (const req of requests) {
        if (!isFontCacheRequest(req.url)) {
          const deleted = await cache.delete(req);
          if (deleted) removed += 1;
        }
      }
    }
  } catch {
    // Ошибки Cache API не должны блокировать обновление страницы.
  }
  return removed;
};

const defaultReloadWithVersion = (nextVersion: string) => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', nextVersion);
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};

const defaultCleanUrlParams = () => {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('_v') && !url.searchParams.has('_swr')) return;
    url.searchParams.delete('_v');
    url.searchParams.delete('_swr');
    window.history.replaceState(null, '', url.toString());
  } catch {
    // Игнорируем в нестандартных окружениях.
  }
};

export const syncBundleWithServerVersion = async (
  env: VersionGuardEnv = {},
): Promise<{ status: 'up-to-date' | 'reloaded' | 'loop-guarded' | 'unreachable'; serverVersion: string | null }> => {
  const bundledVersion = env.bundledVersion ?? BUNDLED_PATCH_VERSION;
  const fetchImpl = env.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl || !bundledVersion) {
    return { status: 'unreachable', serverVersion: null };
  }

  const session =
    env.sessionStorage !== undefined
      ? env.sessionStorage
      : typeof window !== 'undefined'
        ? (() => {
            try { return window.sessionStorage; } catch { return null; }
          })()
        : null;

  try {
    const response = await fetchImpl(`/version.json?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response || !response.ok) {
      return { status: 'unreachable', serverVersion: null };
    }
    const payload = await response.json();
    const serverVersion =
      payload && typeof payload.version === 'string' && payload.version.trim()
        ? payload.version.trim()
        : null;
    if (!serverVersion) {
      return { status: 'unreachable', serverVersion: null };
    }

    if (serverVersion === bundledVersion) {
      try { session?.removeItem(RELOAD_GUARD_SESSION_KEY); } catch { /* noop */ }
      (env.cleanUrlParams ?? defaultCleanUrlParams)();
      return { status: 'up-to-date', serverVersion };
    }

    // Предохранитель от зацикливания: для одной и той же serverVersion
    // автоматическая перезагрузка выполняется не более одного раза за сессию вкладки.
    const alreadyReloadedFor = (() => {
      try { return session?.getItem(RELOAD_GUARD_SESSION_KEY) ?? null; } catch { return null; }
    })();
    if (alreadyReloadedFor === serverVersion) {
      debugLog('versionGuard.loopPrevented', { bundledVersion, serverVersion });
      return { status: 'loop-guarded', serverVersion };
    }

    try { session?.setItem(RELOAD_GUARD_SESSION_KEY, serverVersion); } catch { /* noop */ }

    debugLog('versionGuard.mismatchReload', { bundledVersion, serverVersion });

    await purgeStaleCachesPreservingFonts(env.cachesApi);

    const sw =
      env.serviceWorker !== undefined
        ? env.serviceWorker
        : typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? navigator.serviceWorker
          : null;
    if (sw) {
      try {
        const regs = await sw.getRegistrations();
        await Promise.all(regs.map((reg) => reg.update().catch(() => undefined)));
      } catch {
        // Не блокируем перезагрузку.
      }
    }

    (env.reloadWithVersion ?? defaultReloadWithVersion)(serverVersion);
    return { status: 'reloaded', serverVersion };
  } catch {
    return { status: 'unreachable', serverVersion: null };
  }
};

let watcherStarted = false;

export const startWebVersionWatcher = (): void => {
  if (watcherStarted || typeof window === 'undefined' || typeof document === 'undefined') return;
  // В dev-режиме Metro (__DEV__ === true) не запускаем принудительную перезагрузку
  // по version.json, чтобы не вызывать повторное скачивание dev-бандла.
  if ((globalThis as { __DEV__?: boolean }).__DEV__ === true) return;
  watcherStarted = true;

  syncBundleWithServerVersion().catch(() => undefined);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncBundleWithServerVersion().catch(() => undefined);
    }
  });
};
