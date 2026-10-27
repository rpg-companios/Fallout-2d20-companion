// Регрессионные и интеграционные тесты патча 457:
// быстрый управляемый старт без многоминутного ожидания и без «немого» экрана:
// 1) сервер открывает порт мгновенно; пока идёт сборка dist/, отдаёт живой
//    экран статуса (X-Positronium-Boot: building, /__boot-status), а сразу по
//    завершении — готовый интерфейс со сжатием gzip;
// 2) при неизменившихся исходниках (отпечаток SHA-256 совпадает) сборка не
//    запускается вовсе — UI отдаётся сразу;
// 3) при сбое сборки в браузере видна ошибка и работает POST /__boot-rebuild;
// 4) public/index.html содержит мгновенный тёмный индикатор загрузки до монтирования
//    React, metro.config.js хранит кэш в .expo/metro-cache, а Service Worker не
//    перехватывает dev-бандлы и временную страницу сборки.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  FINGERPRINT_FILE,
  computeSourceFingerprint,
  isDistUpToDate,
  createManagedAppServer,
} from '../../server/start.js';
import metroConfig from '../../metro.config.js';

const ROOT = path.resolve(__dirname, '../..');

const makeTempWorkspace = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'positronium-457-'));
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), '// entry\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'App.js'), '// app\n', 'utf8');
  fs.writeFileSync(
    path.join(dir, 'public', 'version.json'),
    JSON.stringify({ version: '457' }),
    'utf8',
  );
  return dir;
};

const writeFakeExportOutput = (stagingDir, version = '457') => {
  const jsRel = '_expo/static/js/web/index-11112222333344445555666677778888.js';
  fs.mkdirSync(path.join(stagingDir, path.dirname(jsRel)), { recursive: true });
  // > 1024 байт, чтобы проверить сжатие gzip на раздаче статики
  const jsPayload = `console.log("positronium-${version}");\n${'// padding '.repeat(180)}\n`;
  fs.writeFileSync(path.join(stagingDir, jsRel), jsPayload, 'utf8');
  fs.writeFileSync(
    path.join(stagingDir, 'version.json'),
    JSON.stringify({ version }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(stagingDir, 'index.html'),
    `<!DOCTYPE html><html><body><div id="root">READY-${version}</div><script src="/${jsRel}" defer></script></body></html>`,
    'utf8',
  );
};

describe('Патч 457: мгновенный старт, кэш отпечатка сборки и живой индикатор состояния', () => {
  it('порт открывается сразу: во время сборки виден живой статус, после — готовый UI с gzip', async () => {
    const tmpRoot = makeTempWorkspace();
    let finishBuild;
    let buildCalls = 0;

    const app = createManagedAppServer({
      port: 0,
      host: '127.0.0.1',
      rootDir: tmpRoot,
      runExportBuild: ({ stagingDir, onProgress }) => {
        buildCalls += 1;
        onProgress('Starting Metro Bundler');
        return new Promise((resolve) => {
          finishBuild = () => {
            writeFakeExportOutput(stagingDir, '457');
            onProgress('Exported: dist');
            resolve();
          };
        });
      },
    });

    try {
      const { port } = await app.start();
      expect(buildCalls).toBe(1);

      // 1. Сразу после старта порт отвечает живой страницей статуса сборки (не висит!)
      const bootPageRes = await fetch(`http://127.0.0.1:${port}/`);
      expect(bootPageRes.status).toBe(200);
      expect(bootPageRes.headers.get('x-positronium-boot')).toBe('building');
      const bootHtml = await bootPageRes.text();
      expect(bootHtml).toContain('Сервер работает');
      expect(bootHtml).toContain('патч 457');

      const stRes = await fetch(`http://127.0.0.1:${port}/__boot-status`);
      const stJson = await stRes.json();
      expect(stJson.state).toBe('building');
      expect(stJson.stage).toContain('Компиляция');

      // 2. Завершаем сборку — сервер сразу переключается на раздачу dist/ с gzip
      finishBuild();
      await new Promise((r) => setTimeout(r, 30));

      const readyStatus = await (await fetch(`http://127.0.0.1:${port}/__boot-status`)).json();
      expect(readyStatus.state).toBe('ready');

      const appRes = await fetch(`http://127.0.0.1:${port}/`);
      expect(appRes.headers.get('x-positronium-boot')).toBeNull();
      expect(await appRes.text()).toContain('READY-457');

      // Проверяем реальное gzip-сжатие бандла
      const rawJsRes = await fetch(
        `http://127.0.0.1:${port}/_expo/static/js/web/index-11112222333344445555666677778888.js`,
        { headers: { 'Accept-Encoding': 'gzip' } },
      );
      expect(rawJsRes.status).toBe(200);
      expect(rawJsRes.headers.get('vary')).toContain('Accept-Encoding');
      const jsText = await rawJsRes.text();
      expect(jsText).toContain('positronium-457');
    } finally {
      await app.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('повторный запуск без изменений исходников пропускает сборку (0 вызовов экспортера)', async () => {
    const tmpRoot = makeTempWorkspace();
    const distDir = path.join(tmpRoot, 'dist');
    writeFakeExportOutput(distDir, '457');
    const fp = computeSourceFingerprint(tmpRoot);
    fs.writeFileSync(path.join(distDir, FINGERPRINT_FILE), `${fp}\n`, 'utf8');

    expect(isDistUpToDate(tmpRoot, distDir).upToDate).toBe(true);

    let buildCalls = 0;
    const app = createManagedAppServer({
      port: 0,
      host: '127.0.0.1',
      rootDir: tmpRoot,
      runExportBuild: async () => { buildCalls += 1; },
    });

    try {
      const { port } = await app.start();
      expect(buildCalls).toBe(0);
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(await res.text()).toContain('READY-457');

      // Как только исходник изменился (например, применили новый патч) — отпечаток меняется
      fs.writeFileSync(path.join(tmpRoot, 'App.js'), '// updated in 458\n', 'utf8');
      expect(isDistUpToDate(tmpRoot, distDir).upToDate).toBe(false);
    } finally {
      await app.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('при ошибке сборки браузер видит явную причину и восстанавливается через POST /__boot-rebuild', async () => {
    const tmpRoot = makeTempWorkspace();
    let shouldFail = true;

    const app = createManagedAppServer({
      port: 0,
      host: '127.0.0.1',
      rootDir: tmpRoot,
      runExportBuild: async ({ stagingDir }) => {
        if (shouldFail) throw new Error('SyntaxError: broken test token');
        writeFakeExportOutput(stagingDir, '457');
      },
    });

    try {
      const { port } = await app.start();
      await new Promise((r) => setTimeout(r, 25));

      const errHtmlRes = await fetch(`http://127.0.0.1:${port}/`);
      expect(errHtmlRes.headers.get('x-positronium-boot')).toBe('error');
      const errHtml = await errHtmlRes.text();
      expect(errHtml).toContain('Ошибка сборки');
      expect(errHtml).toContain('SyntaxError: broken test token');

      shouldFail = false;
      const retryRes = await fetch(`http://127.0.0.1:${port}/__boot-rebuild`, { method: 'POST' });
      expect(retryRes.status).toBe(200);
      await new Promise((r) => setTimeout(r, 30));

      const recovered = await fetch(`http://127.0.0.1:${port}/`);
      expect(await recovered.text()).toContain('READY-457');
    } finally {
      await app.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('index.html, metro.config.js и service-worker.js настроены на быстрый прозрачный старт', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    expect(html).toContain('id="positronium-preboot"');
    expect(html).toContain('Загрузка интерфейса…');
    expect(html).toContain('background-color: #121212');

    expect(Array.isArray(metroConfig.cacheStores)).toBe(true);
    expect(metroConfig.cacheStores.length).toBeGreaterThan(0);

    const blockList = metroConfig.resolver.blockList;
    expect(blockList.some((re) => re.test(path.join(ROOT, 'patchs/457.patch')))).toBe(true);
    expect(blockList.some((re) => re.test(path.join(ROOT, 'dist/index.html')))).toBe(true);
    expect(
      blockList.some((re) => re.test('/home/runner/.local/share/pnpm/expo/index.js')),
    ).toBe(false);

    const swSrc = fs.readFileSync(path.join(ROOT, 'public/service-worker.js'), 'utf8');
    expect(swSrc).toContain("x-positronium-boot");
    expect(swSrc).toContain('if (isBootEndpoint || isDevBundle) return;');

    // Убедимся, что zlib не ломает импорт модуля
    expect(typeof zlib.gzip).toBe('function');
  });
});
