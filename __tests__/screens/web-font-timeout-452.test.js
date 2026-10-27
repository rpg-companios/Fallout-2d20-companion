// ПРИЁМОЧНЫЙ (патч 452): защита веб-старта на Replit / pnpm от падения
// fontfaceobserver.standalone.js:5:435 ("<N>ms timeout exceeded") и от
// случайной блокировки глобального хранилища /home/runner/.local/share/pnpm/...
// паттерном /\.local\/.*/ в metro.config.js.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import FontFaceObserverDefault, { FontFaceObserver } from '../../src/web/fontfaceobserverShim.ts';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../..');

describe('патч 452: защита загрузки веб-шрифтов и ресурсов pnpm в Metro', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete globalThis.document;
  });

  it('шим FontFaceObserver экспортируется и по умолчанию, и именованно', () => {
    expect(FontFaceObserverDefault).toBe(FontFaceObserver);
    const obs = new FontFaceObserver('material-community', { weight: 400 });
    expect(obs.family).toBe('material-community');
    expect(obs.weight).toBe('400');
    expect(obs.style).toBe('normal');
  });

  it('шим FontFaceObserver штатно ждёт document.fonts.load при быстрой загрузке', async () => {
    const loadMock = vi.fn().mockResolvedValue([{}]);
    globalThis.document = { fonts: { load: loadMock } };

    const obs = new FontFaceObserver('Ionicons');
    const resolved = await obs.load(null, 12000);

    expect(resolved).toBe(obs);
    expect(loadMock).toHaveBeenCalledWith('normal normal 16px "Ionicons"', 'BESbswy');
  });

  it('шим FontFaceObserver НЕ бросает ошибку при таймауте или сбое загрузки .ttf', async () => {
    vi.useFakeTimers();
    // Подвешенный промис имитирует долгую отдачу MaterialCommunityIcons.ttf (1.3 МБ)
    globalThis.document = {
      fonts: {
        load: vi.fn(() => new Promise(() => {})),
      },
    };

    const obs = new FontFaceObserver('material-community');
    let settled = false;
    const promise = obs.load(null, 12000).then((res) => {
      settled = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    const result = await promise;
    expect(settled).toBe(true);
    expect(result).toBe(obs);
  });

  it('шим FontFaceObserver гасит синхронный и асинхронный сбой document.fonts.load', async () => {
    globalThis.document = {
      fonts: {
        load: vi.fn().mockRejectedValue(new Error('network error')),
      },
    };
    const obs = new FontFaceObserver('FontAwesome5_Solid');
    await expect(obs.load()).resolves.toBe(obs);
  });

  it('metro.config.js перенаправляет fontfaceobserver на шим на web и не блокирует глобальный .local/share/pnpm', () => {
    const metroConfig = require('../../metro.config.js');
    const fallbackResolver = vi.fn((_ctx, mod, plat) => ({
      type: 'sourceFile',
      filePath: `/fallback/${plat}/${mod}`,
    }));
    const ctx = { resolveRequest: fallbackResolver };

    const webRes = metroConfig.resolver.resolveRequest(ctx, 'fontfaceobserver', 'web');
    expect(webRes).toEqual({
      type: 'sourceFile',
      filePath: path.join(ROOT, 'src/web/fontfaceobserverShim.ts'),
    });

    const androidRes = metroConfig.resolver.resolveRequest(ctx, 'fontfaceobserver', 'android');
    expect(androidRes.filePath).toBe('/fallback/android/fontfaceobserver');

    const blockList = Array.isArray(metroConfig.resolver.blockList)
      ? metroConfig.resolver.blockList
      : [metroConfig.resolver.blockList];

    const isBlocked = (candidate) => blockList.some((re) => re.test(candidate));

    // Локальные служебные папки внутри репозитория заблокированы
    expect(isBlocked(path.join(ROOT, '.local/state/replit/socket'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.kiro/settings.json'))).toBe(true);
    expect(isBlocked(path.join(ROOT, '.install-backup/2026-10-27/apply-patch.sh'))).toBe(true);

    // Глобальное хранилище pnpm в Replit НЕ блокируется!
    expect(
      isBlocked('/home/runner/.local/share/pnpm/store/v3/files/MaterialCommunityIcons.ttf'),
    ).toBe(false);
  });

  it('index.js оборачивает ExpoFontLoader.loadAsync страховкой от непойманного reject', () => {
    const indexSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    expect(indexSrc).toContain("import 'expo-font'");
    expect(indexSrc).toContain('ExpoFontLoader');
    expect(indexSrc).toContain('font.web.timeoutSwallowed');
  });
});
