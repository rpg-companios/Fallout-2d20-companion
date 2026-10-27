'use strict';

// server/start.js — быстрый управляемый запуск Positronium (патч 457).
//
// Почему раньше запуск занимал 2–5+ минут с пустым экраном:
// `.replit` запускал `npx expo start --web --port 5000` (dev-компилятор Metro),
// который при каждом старте сканировал всё дерево, ждал первого запроса вкладки,
// собирал неминифицированный dev-бандл (~35 МБ raw / 8.3 МБ gzip) на общем CPU
// без единого визуального признака жизни на экране.
//
// Как работает теперь:
// 1. HTTP + WebSocket сервер комнат (/ws) открывает порт мгновенно (< 0.1 сек).
// 2. За ~15 мс считается SHA-256 отпечаток исходников проекта:
//    - если готовая сборка `dist/` уже соответствует исходникам — интерфейс
//      отдаётся сразу со сжатием gzip (~835 КБ) меньше чем за секунду;
//    - если исходники обновились (например, после `./apply-patch.sh`) — браузер
//      В ТУ ЖЕ СЕКУНДУ показывает живой экран статуса сборки (пульс сервера,
//      этап, секундомер, лог ошибки при сбое), а инкрементальная сборка с
//      постоянным кэшем `.expo/metro-cache` атомарно обновляет `dist/` и сама
//      открывает готовый интерфейс.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createRoomServer } = require('./roomServer');

const FINGERPRINT_FILE = '.build-fingerprint';

const SOURCE_ROOT_FILES = [
  'index.js',
  'App.js',
  'app.json',
  'package.json',
  'metro.config.js',
  'tsconfig.json',
];

const SOURCE_DIRS = [
  'public',
  'src',
  'components',
  'modules',
  'domain',
  'db',
  'i18n',
  'styles',
  'assets',
  'settings',
];

const IGNORED_WORKSPACE_DIRS = new Set([
  '.local',
  '.kiro',
  '.install-backup',
  '.installbackup',
  '.publish',
  '.agents',
  '.expo',
  '.git',
  'node_modules',
  'patchs',
  'dist',
  'docs',
  'item-forge',
  'screenshots',
  'сеттинги',
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.cjs', '.mjs',
]);

const readPublicVersion = (rootDir) => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'version.json'), 'utf8'));
    return raw?.version ? String(raw.version) : '';
  } catch {
    return '';
  }
};

const computeSourceScan = (rootDir) => {
  const hash = crypto.createHash('sha256');
  let maxMtimeMs = 0;

  const addFile = (absPath, relPath) => {
    let st;
    try { st = fs.statSync(absPath); } catch { return; }
    if (!st.isFile()) return;
    if (st.mtimeMs > maxMtimeMs) maxMtimeMs = st.mtimeMs;
    const ext = path.extname(relPath).toLowerCase();
    hash.update(`${relPath}\0${st.size}\0`);
    if (TEXT_EXTENSIONS.has(ext) && st.size <= 1024 * 1024) {
      try {
        hash.update(fs.readFileSync(absPath));
      } catch {
        hash.update(String(Math.trunc(st.mtimeMs)));
      }
    } else {
      hash.update(String(Math.trunc(st.mtimeMs)));
    }
    hash.update('\0');
  };

  for (const file of SOURCE_ROOT_FILES) {
    addFile(path.join(rootDir, file), file);
  }

  const walk = (dirPath, relBase) => {
    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_WORKSPACE_DIRS.has(entry.name)) continue;
      const abs = path.join(dirPath, entry.name);
      const rel = `${relBase}/${entry.name}`;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) addFile(abs, rel);
    }
  };

  for (const dir of SOURCE_DIRS) {
    walk(path.join(rootDir, dir), dir);
  }

  return {
    fingerprint: hash.digest('hex'),
    maxMtimeMs,
  };
};

const computeSourceFingerprint = (rootDir) => computeSourceScan(rootDir).fingerprint;

const hasValidDistFiles = (distDir, expectedVersion) => {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) return false;
  let html;
  try { html = fs.readFileSync(indexHtmlPath, 'utf8'); } catch { return false; }
  const scriptMatches = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)];
  if (scriptMatches.length === 0) return false;
  for (const match of scriptMatches) {
    const relScript = match[1].split('?')[0].replace(/^\/+/, '');
    if (!fs.existsSync(path.join(distDir, relScript))) return false;
  }
  if (expectedVersion) {
    try {
      const distVer = JSON.parse(fs.readFileSync(path.join(distDir, 'version.json'), 'utf8'));
      if (String(distVer?.version ?? '') !== expectedVersion) return false;
    } catch {
      return false;
    }
  }
  return true;
};

const isDistUpToDate = (rootDir, distDir = path.join(rootDir, 'dist')) => {
  const expectedVersion = readPublicVersion(rootDir);
  if (!hasValidDistFiles(distDir, expectedVersion)) {
    return { upToDate: false, fingerprint: computeSourceFingerprint(rootDir) };
  }

  const { fingerprint, maxMtimeMs } = computeSourceScan(rootDir);
  const fpPath = path.join(distDir, FINGERPRINT_FILE);
  try {
    const stored = fs.readFileSync(fpPath, 'utf8').trim();
    if (stored === fingerprint) {
      return { upToDate: true, fingerprint };
    }
    return { upToDate: false, fingerprint };
  } catch {
    // Если dist/ только что собран вручную через `npm run build` (без файла
    // отпечатка), но новее всех исходников и совпадает по version.json —
    // принимаем его без лишней пересборки и записываем отпечаток.
    try {
      const indexStat = fs.statSync(path.join(distDir, 'index.html'));
      if (indexStat.mtimeMs >= maxMtimeMs) {
        try { fs.writeFileSync(fpPath, `${fingerprint}\n`, 'utf8'); } catch { /* ignore */ }
        return { upToDate: true, fingerprint };
      }
    } catch {
      // Пересоберём штатно.
    }
    return { upToDate: false, fingerprint };
  }
};

const escapeHtml = (str) => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const renderBootStatusHtml = (status) => {
  const isError = status.state === 'error';
  const versionBadge = status.version ? ` • патч ${escapeHtml(status.version)}` : '';
  const initialJson = JSON.stringify({
    state: status.state,
    version: status.version || '',
    elapsedMs: status.elapsedMs || 0,
    stage: status.stage || '',
    detail: status.detail || '',
    error: status.error || null,
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Positronium — запуск</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; height: 100%;
      background: #111214; color: #f3f4f6;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      width: 100%; max-width: 440px;
      background: #1a1c20; border: 1px solid #32363f; border-radius: 14px;
      padding: 28px 24px; box-shadow: 0 18px 48px rgba(0,0,0,0.55);
    }
    .brand-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      margin-bottom: 18px;
    }
    .brand {
      font-size: 20px; font-weight: 700; color: #f0e68c; letter-spacing: 0.6px;
    }
    .pill {
      display: inline-flex; align-items: center; gap: 7px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
      background: rgba(22, 163, 74, 0.16); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.35);
    }
    .pill.offline {
      background: rgba(234, 179, 8, 0.16); color: #facc15; border-color: rgba(250, 204, 21, 0.35);
    }
    .pill.error {
      background: rgba(220, 38, 38, 0.18); color: #f87171; border-color: rgba(248, 113, 113, 0.4);
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%; background: currentColor;
      animation: pulse 1.3s ease-in-out infinite;
    }
    .pill.error .dot { animation: none; }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.38; transform: scale(0.85); }
    }
    .stage {
      font-size: 15px; font-weight: 600; color: #f9fafb; margin-bottom: 6px;
    }
    .detail {
      font-size: 13px; color: #9ca3af; min-height: 18px; margin-bottom: 16px;
      word-break: break-word;
    }
    .bar-wrap {
      height: 6px; width: 100%; background: #272a30; border-radius: 999px;
      overflow: hidden; margin-bottom: 14px;
    }
    .bar-fill {
      height: 100%; width: 38%; background: linear-gradient(90deg, #b8942a, #f0e68c, #d4af37);
      border-radius: 999px; animation: slide 1.6s ease-in-out infinite;
    }
    @keyframes slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(270%); }
    }
    .meta {
      display: flex; justify-content: space-between; font-size: 12px; color: #9ca3af;
    }
    .hint {
      margin-top: 14px; padding-top: 12px; border-top: 1px solid #2a2d35;
      font-size: 12px; color: #8b93a1; line-height: 1.45;
    }
    pre.err {
      margin: 12px 0 16px; padding: 12px; border-radius: 8px;
      background: #111214; border: 1px solid rgba(248, 113, 113, 0.35);
      color: #fca5a5; font-size: 11.5px; max-height: 200px; overflow: auto;
      white-space: pre-wrap; word-break: break-word;
    }
    button.retry {
      width: 100%; padding: 11px 16px; border: 0; border-radius: 8px;
      background: #d4af37; color: #111827; font-size: 14px; font-weight: 700;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand-row">
      <div class="brand">Positronium${versionBadge}</div>
      <div id="pill" class="pill${isError ? ' error' : ''}">
        <span class="dot"></span>
        <span id="pill-text">${isError ? 'Ошибка сборки' : 'Сервер работает'}</span>
      </div>
    </div>
    <div id="stage" class="stage">${escapeHtml(status.stage || 'Подготовка веб-интерфейса…')}</div>
    <div id="detail" class="detail">${escapeHtml(status.detail || 'Проверка актуальности модулей…')}</div>
    <div id="bar" class="bar-wrap"${isError ? ' style="display:none"' : ''}><div class="bar-fill"></div></div>
    <pre id="err" class="err"${isError && status.error ? '' : ' style="display:none"'}>${escapeHtml(status.error || '')}</pre>
    <button id="retry-btn" class="retry"${isError ? '' : ' style="display:none"'} onclick="retryBuild()">Повторить сборку</button>
    <div class="meta">
      <span id="state-note">Автоматический переход по готовности</span>
      <span id="timer">0:00</span>
    </div>
    <div class="hint">
      Идёт сборка обновлённых файлов приложения. Повторные запуски без изменений открываются за секунду.
    </div>
  </div>
  <script>
    (function () {
      var initial = ${initialJson};
      var baseElapsed = initial.elapsedMs || 0;
      var clientStart = Date.now();
      var pill = document.getElementById('pill');
      var pillText = document.getElementById('pill-text');
      var stageEl = document.getElementById('stage');
      var detailEl = document.getElementById('detail');
      var timerEl = document.getElementById('timer');
      var barEl = document.getElementById('bar');
      var errEl = document.getElementById('err');
      var retryBtn = document.getElementById('retry-btn');

      function fmt(ms) {
        var totalSec = Math.max(0, Math.floor(ms / 1000));
        var m = Math.floor(totalSec / 60);
        var s = totalSec % 60;
        return m + ':' + (s < 10 ? '0' + s : s);
      }

      setInterval(function () {
        if (pill.className.indexOf('error') === -1) {
          timerEl.textContent = fmt(baseElapsed + (Date.now() - clientStart));
        }
      }, 500);
      timerEl.textContent = fmt(baseElapsed);

      window.retryBuild = function () {
        retryBtn.disabled = true;
        fetch('/__boot-rebuild', { method: 'POST', cache: 'no-store' })
          .then(function () {
            retryBtn.disabled = false;
            clientStart = Date.now();
            baseElapsed = 0;
            poll();
          })
          .catch(function () { retryBtn.disabled = false; });
      };

      function openApp(ver) {
        stageEl.textContent = 'Готово! Открываем интерфейс…';
        detailEl.textContent = '';
        try {
          var u = new URL(window.location.href);
          if (ver) u.searchParams.set('_v', ver);
          window.location.replace(u.toString());
        } catch (_) {
          window.location.reload();
        }
      }

      function poll() {
        fetch('/__boot-status?_t=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (st) {
            if (st.state === 'ready') {
              openApp(st.version);
              return;
            }
            baseElapsed = st.elapsedMs || 0;
            clientStart = Date.now();
            stageEl.textContent = st.stage || 'Подготовка веб-интерфейса…';
            detailEl.textContent = st.detail || '';
            if (st.state === 'error') {
              pill.className = 'pill error';
              pillText.textContent = 'Ошибка сборки';
              barEl.style.display = 'none';
              errEl.style.display = 'block';
              errEl.textContent = st.error || 'Неизвестная ошибка сборки';
              retryBtn.style.display = 'block';
            } else {
              pill.className = 'pill';
              pillText.textContent = 'Сервер работает';
              barEl.style.display = 'block';
              errEl.style.display = 'none';
              retryBtn.style.display = 'none';
            }
          })
          .catch(function () {
            pill.className = 'pill offline';
            pillText.textContent = 'Переподключение к серверу…';
          });
      }

      setInterval(poll, 950);
    })();
  </script>
</body>
</html>`;
};

const swapDirectoryAtomic = (stagingDir, targetDir, tempParentDir) => {
  const backupDir = path.join(tempParentDir, `dist-prev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  try {
    if (fs.existsSync(targetDir)) {
      fs.renameSync(targetDir, backupDir);
    }
    fs.renameSync(stagingDir, targetDir);
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  } catch {
    // Fallback для сред, где dist/ примонтирован отдельной ФС (EXDEV).
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(stagingDir, targetDir, { recursive: true, force: true });
    fs.rmSync(stagingDir, { recursive: true, force: true });
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  }
};

const defaultRunExportBuild = ({ rootDir, stagingDir, onProgress }) => new Promise((resolve, reject) => {
  let expoCli;
  try {
    expoCli = require.resolve('expo/bin/cli', { paths: [rootDir] });
  } catch (err) {
    reject(new Error(`Не найден expo/bin/cli: ${err.message}`));
    return;
  }

  const available = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : (os.cpus()?.length || 2);
  const maxWorkers = Math.max(1, Math.min(4, available));

  const args = [
    expoCli,
    'export',
    '--platform',
    'web',
    '--output-dir',
    stagingDir,
    '--max-workers',
    String(maxWorkers),
  ];

  const tail = [];
  const pushLines = (chunk) => {
    const lines = chunk
      .toString('utf8')
      .replace(/\x1b\[[0-9;]*m/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      tail.push(line);
      if (tail.length > 30) tail.shift();
      if (typeof onProgress === 'function') onProgress(line);
    }
  };

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', pushLines);
  child.stderr.on('data', pushLines);
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(tail.slice(-15).join('\n') || `expo export завершился с кодом ${code}`));
    }
  });
});

const createManagedAppServer = ({
  port = Number(process.env.PORT || 5000),
  host = process.env.HOST || '0.0.0.0',
  rootDir = path.join(__dirname, '..'),
  distDir = path.join(rootDir, 'dist'),
  autoBuild = process.env.SKIP_AUTO_BUILD !== '1',
  runExportBuild = defaultRunExportBuild,
} = {}) => {
  const expoCacheRoot = path.join(rootDir, '.expo');
  let activeFingerprint = null;
  let lastCheckAt = 0;
  let buildPromise = null;

  const status = {
    state: 'ready',
    version: readPublicVersion(rootDir),
    startedAt: 0,
    stage: 'Готово',
    detail: '',
    error: null,
  };

  const snapshotStatus = () => ({
    state: status.state,
    version: status.version,
    elapsedMs: status.state === 'building' && status.startedAt ? Date.now() - status.startedAt : 0,
    stage: status.stage,
    detail: status.detail,
    error: status.error,
  });

  const startBuild = (targetFingerprint) => {
    if (buildPromise) return buildPromise;
    status.state = 'building';
    status.version = readPublicVersion(rootDir);
    status.startedAt = Date.now();
    status.stage = 'Сборка веб-интерфейса Positronium…';
    status.detail = 'Запуск сборщика Metro…';
    status.error = null;

    const stagingDir = path.join(expoCacheRoot, 'dist-staging');
    try {
      fs.mkdirSync(expoCacheRoot, { recursive: true });
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch { /* ignore */ }

    // eslint-disable-next-line no-console
    console.log(`[positronium] Изменились исходники — собираем свежий dist/ (патч ${status.version || '?'})…`);

    buildPromise = runExportBuild({
      rootDir,
      stagingDir,
      onProgress: (line) => {
        if (/Starting Metro/i.test(line)) {
          status.stage = 'Компиляция модулей интерфейса…';
          status.detail = 'Metro собирает граф модулей (используется кэш .expo/metro-cache)';
        } else if (/Web Bundled/i.test(line)) {
          status.stage = 'Запись статических файлов и ресурсов…';
          status.detail = line;
        } else if (/Exported:/i.test(line)) {
          status.stage = 'Завершение сборки…';
          status.detail = line;
        } else if (!/^›\s|^assets\/|^modules\/|^node_modules\//i.test(line)) {
          status.detail = line.slice(0, 160);
        }
      },
    })
      .then(() => {
        const finalFingerprint = computeSourceFingerprint(rootDir) || targetFingerprint;
        fs.writeFileSync(path.join(stagingDir, FINGERPRINT_FILE), `${finalFingerprint}\n`, 'utf8');
        swapDirectoryAtomic(stagingDir, distDir, expoCacheRoot);
        activeFingerprint = finalFingerprint;
        lastCheckAt = Date.now();
        status.version = readPublicVersion(rootDir);
        status.state = 'ready';
        status.stage = 'Готово';
        status.detail = '';
        status.error = null;
        const tookSec = ((Date.now() - status.startedAt) / 1000).toFixed(1);
        // eslint-disable-next-line no-console
        console.log(`[positronium] Сборка готова за ${tookSec} сек (версия ${status.version || '?'}).`);
      })
      .catch((err) => {
        status.state = 'error';
        status.stage = 'Не удалось собрать веб-интерфейс';
        status.detail = 'Проверьте лог ошибки ниже и нажмите «Повторить сборку».';
        status.error = err?.message || String(err);
        // eslint-disable-next-line no-console
        console.error('[positronium] Ошибка сборки:', status.error);
      })
      .finally(() => {
        buildPromise = null;
      });

    return buildPromise;
  };

  const ensureUpToDate = (forceCheck = false) => {
    if (!autoBuild || status.state === 'building') return;
    const now = Date.now();
    if (!forceCheck && now - lastCheckAt < 2000 && activeFingerprint) return;
    lastCheckAt = now;
    const check = isDistUpToDate(rootDir, distDir);
    if (check.upToDate) {
      activeFingerprint = check.fingerprint;
      status.version = readPublicVersion(rootDir);
      if (status.state !== 'ready') {
        status.state = 'ready';
        status.error = null;
      }
      return;
    }
    if (status.state !== 'error' || forceCheck) {
      startBuild(check.fingerprint);
    }
  };

  const beforeStatic = (req, res) => {
    const rawUrl = req.url || '/';
    const qIdx = rawUrl.indexOf('?');
    const pathname = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;

    if (pathname === '/__boot-status') {
      ensureUpToDate(false);
      const body = JSON.stringify(snapshotStatus());
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });
      res.end(body);
      return true;
    }

    if (pathname === '/__boot-rebuild' && req.method === 'POST') {
      const fp = computeSourceFingerprint(rootDir);
      startBuild(fp);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    if (pathname === '/' || pathname === '/index.html' || pathname === '/version.json' || !path.extname(pathname)) {
      ensureUpToDate(false);
    }

    if (status.state !== 'ready') {
      const isHtmlNav = pathname === '/' || pathname === '/index.html' || !path.extname(pathname);
      if (isHtmlNav) {
        const html = renderBootStatusHtml(snapshotStatus());
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          'X-Positronium-Boot': status.state,
        });
        res.end(html);
        return true;
      }
    }

    return false;
  };

  const roomApp = createRoomServer({
    port,
    host,
    distDir,
    beforeStatic,
  });

  const start = async () => {
    ensureUpToDate(true);
    const address = await roomApp.start();
    // eslint-disable-next-line no-console
    console.log(
      `[room-server] Positronium: ${address.address}:${address.port} (статус: ${status.state}, версия: ${status.version || '?'})`,
    );
    return address;
  };

  return {
    ...roomApp,
    start,
    getBootStatus: snapshotStatus,
    ensureUpToDate,
    triggerRebuild: () => startBuild(computeSourceFingerprint(rootDir)),
  };
};

if (require.main === module) {
  const app = createManagedAppServer();
  app.start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[positronium] Не удалось запустить сервер:', err);
    process.exit(1);
  });
  process.on('SIGTERM', () => app.close().finally(() => process.exit(0)));
  process.on('SIGINT', () => app.close().finally(() => process.exit(0)));
}

module.exports = {
  FINGERPRINT_FILE,
  IGNORED_WORKSPACE_DIRS,
  computeSourceFingerprint,
  isDistUpToDate,
  renderBootStatusHtml,
  createManagedAppServer,
};
