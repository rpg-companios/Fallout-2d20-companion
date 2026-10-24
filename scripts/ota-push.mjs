#!/usr/bin/env node
// Публикация OTA-обновления (JS-бандла) в один из двух каналов EAS.
//
//   scripts/testing-push.sh   → канал preview     (только тестировщик)
//   scripts/product-push.sh   → канал production  (все установленные APK)
//
// Оба скрипта — тонкие обёртки над этим файлом, разница только в канале и в
// проверках. Здесь же всё, что должно быть одинаковым: чтение версии, проверка
// бандла перед отправкой, отпечаток исходников, понятный отчёт.
//
// Почему перед отправкой собирается бандл: у проекта уже был случай, когда OTA
// уезжал с неразрешимым импортом (`Unable to resolve module ./src/i18n/appI18n`)
// и приложение у людей не запускалось. `expo export` ловит такую ошибку за
// 20–40 секунд — дешевле, чем откат.
//
// Почему продакшн сверяется с тестом: между «проверил» и «выпустил» в дерево
// попадают правки. Сверка идёт по отпечатку исходников (см. lib/ota-guard.mjs).
// Не совпало — отказ с перечнем и подсказкой, а не тихая отправка непроверенного.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTestedRecord,
  compareTestedWithCurrent,
  describeSourceState,
  hashWorkingFiles,
  parseStatus,
  readTestedRecord,
  TESTED_STATE_FILE,
  writeTestedRecord,
} from './lib/ota-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fail = (message) => {
  console.error(`[ota] ${message}`);
  process.exit(1);
};

const usage = () => [
  'Публикация OTA-обновления.',
  '',
  '  ./scripts/testing-push.sh --message "что проверить"   канал preview, только тест',
  '  ./scripts/product-push.sh --message "что изменилось"  канал production, всем',
  '',
  'Флаги:',
  '  --message "..."     текст обновления (по умолчанию — версия и коммит)',
  '  --platform P        android (по умолчанию) | ios | all',
  '  --dry-run           показать план и проверки, ничего не отправлять',
  '  --force             product: отправить даже если код изменился после теста',
  '  --skip-export       не собирать бандл перед отправкой (быстрее, но слепо)',
  '',
  'Каналы заданы в eas.json: профиль preview → канал preview,',
  'профиль public/production → канал production.',
].join('\n');

const args = { channel: null, message: null, platform: 'android', dryRun: false, force: false, skipExport: false };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  const value = () => {
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) fail(`после ${arg} нужно значение`);
    index += 1;
    return next;
  };
  switch (arg) {
    case '-h':
    case '--help': console.log(usage()); process.exit(0); break;
    case '--channel': args.channel = value(); break;
    case '--message': args.message = value(); break;
    case '--platform': args.platform = value(); break;
    case '--dry-run': args.dryRun = true; break;
    case '--force': args.force = true; break;
    case '--skip-export': args.skipExport = true; break;
    default: fail(`неизвестный флаг: ${arg}\n\n${usage()}`);
  }
}

const CHANNELS = {
  preview: {
    title: 'preview — только тестировщик',
    hint: 'Проверь на телефоне, потом выпускай всем: ./scripts/product-push.sh',
  },
  production: {
    title: 'production — все установленные APK',
    hint: 'Обновление скачается при следующем запуске приложения.',
  },
};

if (!args.channel) fail(`не задан канал\n\n${usage()}`);
if (!CHANNELS[args.channel]) fail(`неизвестный канал "${args.channel}": бывает preview или production`);
if (!['android', 'ios', 'all'].includes(args.platform)) {
  fail(`--platform: android, ios или all (получено "${args.platform}")`);
}

const channel = CHANNELS[args.channel];

// maxBuffer по умолчанию 1 МБ мало: `git diff --binary` по этому репозиторию
// легко даёт несколько мегабайт, и Node падал бы с ENOBUFS на ровном месте.
const GIT_MAX_BUFFER = 256 * 1024 * 1024;

const run = (command, commandArgs, options = {}) => execFileSync(command, commandArgs, {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
  maxBuffer: GIT_MAX_BUFFER,
  ...options,
});

const git = (commandArgs) => run('git', commandArgs);

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch (error) {
    fail(`не читается ${file}: ${error.message}`);
    return null;
  }
};

const app = readJson('app.json').expo ?? {};
const packageJson = readJson('package.json');
const version = String(app.version ?? '');
if (!version) fail('в app.json нет expo.version — без него OTA не привязать к сборке');

// Политика runtimeVersion — то, от чего зависит «доедет ли обновление».
const runtimeVersion = typeof app.runtimeVersion === 'string'
  ? app.runtimeVersion
  : (app.runtimeVersion?.policy === 'appVersion' ? version : String(app.runtimeVersion?.policy ?? version));

if (!app.updates?.url || app.updates?.enabled === false) {
  fail('в app.json не настроен expo-updates (updates.url / updates.enabled): OTA некуда отправлять');
}
if (!app.extra?.eas?.projectId) {
  fail('в app.json нет extra.eas.projectId: проект EAS не привязан');
}

// --- состояние исходников --------------------------------------------------

const shortCommit = git(['rev-parse', '--short', 'HEAD']).trim();
const commit = git(['rev-parse', 'HEAD']).trim();
const statusPorcelain = git(['status', '--porcelain', '-uall']);
const changedPaths = parseStatus(statusPorcelain).map((entry) => entry.path);
const state = describeSourceState({
  commit,
  statusPorcelain,
  hashes: hashWorkingFiles(ROOT, changedPaths),
});
const dirtyCount = state.files.length;

console.log(`[ota] канал:     ${args.channel} (${channel.title})`);
console.log(`[ota] версия:    ${version} · runtime ${runtimeVersion}`);
console.log(`[ota] платформа: ${args.platform}`);
console.log(`[ota] коммит:    ${shortCommit}${dirtyCount > 0 ? ` · незакоммиченных правок: ${dirtyCount}` : ' · дерево чистое'}`);

// --- проверка «это то, что тестировали» ------------------------------------

if (args.channel === 'production') {
  const tested = readTestedRecord(ROOT);
  const comparison = compareTestedWithCurrent({
    tested,
    current: { ...state, runtimeVersion },
    platform: args.platform,
  });

  if (!comparison.ok) {
    if (args.force) {
      console.warn('[ota] ВНИМАНИЕ: сверка с тестом не прошла, но включён --force');
      for (const problem of comparison.problems) {
        console.warn(`[ota]   ${problem.code}: ${JSON.stringify(problem.params)}`);
      }
    } else {
      console.error('[ota] ОТКАЗ: в продакшн уехало бы не то, что проверяли.');
      for (const problem of comparison.problems) {
        switch (problem.code) {
          case 'no-tested-record':
            console.error(`[ota]   тестовой публикации нет (${TESTED_STATE_FILE} не найден).`);
            console.error('[ota]   Сначала: ./scripts/testing-push.sh --message "..."');
            break;
          case 'other-commit':
            console.error(`[ota]   коммит изменился: тестировали ${String(problem.params.tested).slice(0, 7)}, `
              + `сейчас ${String(problem.params.current).slice(0, 7)}.`);
            break;
          case 'other-changes': {
            const paths = Array.isArray(problem.params.paths) ? problem.params.paths : [];
            console.error(`[ota]   после теста изменились файлы (${paths.length}):`);
            for (const file of paths.slice(0, 8)) console.error(`[ota]     ${file}`);
            if (paths.length > 8) console.error(`[ota]     … ещё ${paths.length - 8}`);
            break;
          }
          case 'other-runtime-version':
            console.error(`[ota]   версия приложения изменилась: тестировали под ${problem.params.tested}, `
              + `сейчас ${problem.params.current}. OTA на старые APK не доедет — нужен новый APK `
              + '(npm run release) и тест уже на нём.');
            break;
          case 'other-platform':
            console.error(`[ota]   платформа: тестировали ${problem.params.tested}, публикуем ${problem.params.current}.`);
            break;
          default:
            console.error(`[ota]   ${problem.code}: ${JSON.stringify(problem.params)}`);
        }
      }
      console.error('[ota] Если уверены — повторите с --force.');
      process.exit(1);
    }
  } else {
    console.log('[ota] сверка:    код совпадает с тем, что проверяли на тесте');
    if (tested?.at) console.log(`[ota] проверено: ${tested.at}${tested.message ? ` · «${tested.message}»` : ''}`);
  }
}

// --- проверка, что бандл вообще собирается ---------------------------------

const exportBundle = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-export-'));
  try {
    run('npx', ['expo', 'export', '--platform', args.platform, '--output-dir', directory], {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
    let bytes = 0;
    const walk = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(full);
        else bytes += fs.statSync(full).size;
      }
    };
    walk(directory);
    return bytes;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

if (args.skipExport) {
  console.warn('[ota] сборка бандла пропущена (--skip-export): ошибку импорта поймает только телефон');
} else {
  console.log(`[ota] проверяю сборку бандла (${args.platform})…`);
  try {
    const bytes = exportBundle();
    console.log(`[ota] бандл собирается: ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
  } catch (error) {
    const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
    const tail = output.split('\n').filter(Boolean).slice(-15).join('\n');
    fail(
      'бандл не собирается — OTA не отправляю.\n'
      + `${tail}\n\n`
      + 'Такое обновление уронило бы приложение при запуске. Если node_modules не ставились: npm ci',
    );
  }
}

// --- отправка ---------------------------------------------------------------

const message = args.message
  ?? `OTA ${version} @ ${shortCommit}${dirtyCount > 0 ? ` (+${dirtyCount} правок)` : ''}`;
const easArgs = [
  'eas-cli',
  'update',
  '--channel', args.channel,
  '--platform', args.platform,
  '--message', message,
  '--non-interactive',
  '--json',
];

if (args.dryRun) {
  console.log(`[ota] dry-run: npx ${easArgs.join(' ')}`);
  if (args.channel === 'preview') console.log('[ota] dry-run: запись о тесте не пишется');
  console.log('[ota] ничего не отправлено.');
  process.exit(0);
}

console.log(`[ota] отправляю: npx ${easArgs.join(' ')}`);
let updateId = null;
const startedAt = Date.now();
try {
  const output = run('npx', easArgs, { maxBuffer: 16 * 1024 * 1024 });
  try {
    const parsed = JSON.parse(output.slice(output.indexOf('[')));
    updateId = parsed?.[0]?.group ?? parsed?.[0]?.id ?? null;
  } catch {
    // EAS иногда печатает не только JSON — идентификатор не критичен.
  }
  console.log(`[ota] отправлено за ${Math.round((Date.now() - startedAt) / 1000)} с${updateId ? ` · группа ${updateId}` : ''}`);
} catch (error) {
  const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
  const tail = output.split('\n').filter(Boolean).slice(-15).join('\n');
  fail(`EAS не принял обновление.\n${tail}`);
}

if (args.channel === 'preview') {
  const file = writeTestedRecord(ROOT, buildTestedRecord({
    channel: args.channel,
    state,
    version,
    runtimeVersion,
    platform: args.platform,
    message,
    updateId,
  }));
  console.log(`[ota] запись о тесте: ${path.relative(ROOT, file)} (коммит ${shortCommit}`
    + `${dirtyCount > 0 ? `, правок ${dirtyCount}` : ''})`);
}

console.log(`[ota] ${channel.hint}`);
console.log(`[ota] проект EAS: ${packageJson.name ?? 'positronium'} · ${String(app.updates.url)}`);
