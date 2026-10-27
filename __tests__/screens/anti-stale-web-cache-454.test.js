// Регрессионные тесты патча 454:
// разделение серверного кэша трансформации Metro (без --clear) и браузерного
// веб-кэша, чтобы новые правки UI всегда показывались сразу без ручной чистки:
// 1) Cache-Control: no-store для HTML / version.json / service-worker.js / dev .bundle,
//    и public, immutable для шрифтов (.ttf/.woff2) и контент-хэшированных файлов;
// 2) Service Worker обходит HTTP-кэш браузера (cache: 'no-cache') на навигации и
//    нехэшированных запросах и не складывает dev-бандл в Cache Storage;
// 3) versionGuard сравнивает версию вшитого JS-бандла с живым /version.json и при
//    расхождении один раз обновляет кэш (сохраняя .ttf-иконки) и перезагружает вкладку.

import { describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  cacheControlForPath,
  attachSmartCacheHeaders,
} from '../../server/roomServer.js';
import {
  RELOAD_GUARD_SESSION_KEY,
  purgeStaleCachesPreservingFonts,
  syncBundleWithServerVersion,
} from '../../src/web/versionGuard';

const ROOT = path.resolve(__dirname, '../..');

const makeMemorySession = () => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
};

describe('Патч 454: анти-устаревание веб-кэша браузера при сохранённом кэше Metro', () => {
  it('cacheControlForPath разделяет изменяемые точки входа (no-store) и неизменяемые шрифты/хэши (immutable)', () => {
    expect(cacheControlForPath('/')).toBe('no-store, no-cache, must-revalidate');
    expect(cacheControlForPath('/index.html')).toBe('no-store, no-cache, must-revalidate');
    expect(cacheControlForPath('/service-worker.js')).toBe('no-store, no-cache, must-revalidate');
    expect(cacheControlForPath('/version.json')).toBe('no-store, no-cache, must-revalidate');
    expect(cacheControlForPath('/index.bundle', '?platform=web&dev=true')).toBe(
      'no-store, no-cache, must-revalidate',
    );

    expect(
      cacheControlForPath('/_expo/static/js/web/index-f4421c79eee87f76730c906acbb58608.js'),
    ).toBe('public, max-age=31536000, immutable');
    expect(
      cacheControlForPath('/assets/bg.48680110a496f93671a1dc8fc5adfd54.png'),
    ).toBe('public, max-age=31536000, immutable');
    expect(
      cacheControlForPath(
        '/assets/',
        '?unstable_path=.%2Fnode_modules%2F%40expo%2Fvector-icons%2FFonts%2FMaterialCommunityIcons.ttf&platform=web',
      ),
    ).toBe('public, max-age=31536000, immutable');
  });

  it('attachSmartCacheHeaders проставляет HTTP-заголовки на ответах dev-сервера', async () => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(req.url);
    });
    attachSmartCacheHeaders(srv);

    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const { port } = srv.address();

    try {
      const bundleRes = await fetch(`http://127.0.0.1:${port}/index.bundle?platform=web&dev=true`);
      expect(bundleRes.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
      expect(bundleRes.headers.get('pragma')).toBe('no-cache');

      const fontRes = await fetch(
        `http://127.0.0.1:${port}/assets/?unstable_path=MaterialCommunityIcons.ttf&platform=web`,
      );
      expect(fontRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  it('purgeStaleCachesPreservingFonts удаляет HTML/JS из Cache Storage, но сохраняет .ttf/.woff2 иконки', async () => {
    const entries = new Map([
      ['https://app.test/index.html', true],
      ['https://app.test/_expo/static/js/web/index-old.js', true],
      ['https://app.test/assets/MaterialCommunityIcons.6e4355.ttf', true],
      ['https://app.test/assets/?unstable_path=Ionicons.ttf&platform=web', true],
    ]);

    const fakeCache = {
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      delete: async (req) => entries.delete(req.url),
    };
    const fakeCachesApi = {
      keys: async () => ['rpg-companion-v11'],
      open: async () => fakeCache,
    };

    const removed = await purgeStaleCachesPreservingFonts(fakeCachesApi);
    expect(removed).toBe(2);
    expect([...entries.keys()]).toEqual([
      'https://app.test/assets/MaterialCommunityIcons.6e4355.ttf',
      'https://app.test/assets/?unstable_path=Ionicons.ttf&platform=web',
    ]);
  });

  it('syncBundleWithServerVersion перезагружает вкладку при новой версии на сервере и защищён от цикла', async () => {
    const session = makeMemorySession();
    const reloads = [];
    let cleaned = 0;
    const swUpdate = vi.fn().mockResolvedValue(undefined);
    const fakeSw = {
      getRegistrations: async () => [{ update: swUpdate }],
    };

    // 1. Версия совпадает — перезагрузки нет, чистим служебные query-параметры
    const same = await syncBundleWithServerVersion({
      bundledVersion: '454',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '454' }),
      }),
      sessionStorage: session,
      cachesApi: null,
      serviceWorker: fakeSw,
      reloadWithVersion: (v) => reloads.push(v),
      cleanUrlParams: () => { cleaned += 1; },
    });
    expect(same).toEqual({ status: 'up-to-date', serverVersion: '454' });
    expect(reloads).toEqual([]);
    expect(cleaned).toBe(1);

    // 2. Сервер ушёл вперёд (455) — чистится кэш, обновляется SW, один раз вызывается reload
    const updated = await syncBundleWithServerVersion({
      bundledVersion: '454',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '455' }),
      }),
      sessionStorage: session,
      cachesApi: null,
      serviceWorker: fakeSw,
      reloadWithVersion: (v) => reloads.push(v),
    });
    expect(updated).toEqual({ status: 'reloaded', serverVersion: '455' });
    expect(reloads).toEqual(['455']);
    expect(swUpdate).toHaveBeenCalledTimes(1);
    expect(session.getItem(RELOAD_GUARD_SESSION_KEY)).toBe('455');

    // 3. Повторный вызов для той же 455 в этой же сессии — срабатывает защита от цикла
    const guarded = await syncBundleWithServerVersion({
      bundledVersion: '454',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '455' }),
      }),
      sessionStorage: session,
      cachesApi: null,
      serviceWorker: fakeSw,
      reloadWithVersion: (v) => reloads.push(v),
    });
    expect(guarded).toEqual({ status: 'loop-guarded', serverVersion: '455' });
    expect(reloads).toEqual(['455']);
  });

  it('service-worker.js и index.js обходят HTTP-кэш для HTML, воркера и dev-бандлов', () => {
    const swSrc = fs.readFileSync(path.join(ROOT, 'public/service-worker.js'), 'utf8');
    expect(swSrc).toContain("new Request(request, { cache: 'no-cache' })");
    expect(swSrc).toContain("new Request(event.request, { cache: 'no-cache' })");
    expect(swSrc).toContain('isDevBundle');

    const indexSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    expect(indexSrc).toContain("updateViaCache: 'none'");
    expect(indexSrc).toContain('startWebVersionWatcher()');
  });
});
