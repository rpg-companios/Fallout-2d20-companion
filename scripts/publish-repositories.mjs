#!/usr/bin/env node
// Публикация правок из этого (совмещённого) репозитория в целевые репозитории:
//
//   engine  → https://github.com/rpg-companios/ttrpg-engine        (APK/AAB)
//   setting → https://github.com/rpg-companios/positronium-game-settings (.trpg)
//
// Порядок работы владельца: сначала правим здесь, потом запускаем скрипт.
// Скрипт собирает дерево целевого репозитория из текущего checkout, пишет
// патч (--patch), коммитит и пушит (--push).
//
// Здесь только код. Сборка и релиз живут в целевых репозиториях, рядом с
// артефактом:
//
//   движок  — npm run release       (scripts/release.mjs: APK/AAB + релиз)
//   сеттинг — ./scripts/release.sh  (тот же сценарий: .trpg + релиз)
//
// Поэтому --release (а также --asset/--bump/--version) отклоняется с
// подсказкой, а release.json и app-release.json в целевом репозитории
// сохраняются как есть: публикация кода их не откатывает.
//
// Примеры:
//   node scripts/publish-repositories.mjs                     # план, ничего не меняет
//   node scripts/publish-repositories.mjs --target engine --patch
//   node scripts/publish-repositories.mjs --target setting --push
//
// Перед сборкой дерева checkout обновляется из origin (fast-forward, только
// при чистом дереве): публикуется то, что уже лежит на GitHub, а не случайно
// устаревшая копия. Отключить — --no-pull.
//
// Без --push скрипт работает как «показать, что уедет»: клонирует целевой
// репозиторий в .publish/ и печатает список изменений.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncCheckout } from './lib/git-sync.mjs';
import {
  APP_RELEASE_FILE,
  hostModuleIds,
  keepPublishedVersion,
  planEngineFiles,
  planSettingLegalFiles,
  planSettingReleaseFiles,
  planSettingToolFiles,
  planSettingWallets,
  releaseNotesFile,
  RELEASE_INDEX_FILE,
  renderSettingReadme,
  renderToolsPackageJson,
  renderToolsReadme,
  TOOLS_DIR,
} from './lib/repository-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPOSITORIES_FILE = path.join(ROOT, 'settings', 'repositories.json');

const fail = (message) => {
  console.error(`[publish] ${message}`);
  process.exit(1);
};

// Аргументы релиза убраны вместе с релизом: подсказываем, куда переехали.
const RELEASE_ARGUMENTS = {
  '--release': 'сборка и релиз теперь в целевом репозитории: ./scripts/release.sh там же, где артефакт',
  '--asset': 'файл прикладывает релизный сценарий в целевом репозитории',
  '--bump': 'шаг версии задаётся релизу: ./scripts/release.sh --bump minor',
  '--version': 'номер версии задаётся релизу: ./scripts/release.sh --version 1.2.0',
  '--no-prune-legacy': 'старые теги убирает релиз сеттинга',
};

const parseArguments = (argv) => {
  const args = {
    target: 'all',
    workdir: '.publish',
    patch: false,
    push: false,
    message: null,
    keep: false,
    pull: true,
    config: DEFAULT_REPOSITORIES_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (RELEASE_ARGUMENTS[argument]) {
      fail(`${argument}: ${RELEASE_ARGUMENTS[argument]}`);
    }
    switch (argument) {
      case '--target': args.target = argv[++index]; break;
      case '--workdir': args.workdir = argv[++index]; break;
      case '--message': args.message = argv[++index]; break;
      case '--config': args.config = path.resolve(argv[++index]); break;
      case '--patch': args.patch = true; break;
      case '--push': args.push = true; break;
      case '--keep': args.keep = true; break;
      case '--no-pull': args.pull = false; break;
      default:
        fail(`unknown argument: ${argument}`);
    }
  }
  if (!['all', 'engine', 'setting'].includes(args.target)) fail(`unknown target: ${args.target}`);
  return args;
};

const git = (cwd, ...args) => execFileSync('git', [...authArgs(), ...args], { cwd, encoding: 'utf8' }).trim();

// Подпись коммита в целевых репозиториях: у клона может не быть настроенного
// git identity, а публикация не должна требовать ручной настройки.
const commit = (cwd, message) => execFileSync('git', [
  '-c', `user.name=${process.env.PUBLISH_GIT_NAME || 'Positronium publish'}`,
  '-c', `user.email=${process.env.PUBLISH_GIT_EMAIL || 'publish@positronium.local'}`,
  'commit', '-m', message,
], { cwd, stdio: 'inherit' });

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// ---------------------------------------------------------------------------
// Авторизация.
//
// В Replit и CI git обычно не имеет настроенного credential helper, поэтому
// токен берём из окружения и передаём git'у заголовком на один вызов: в
// .git/config он не попадает.
// ---------------------------------------------------------------------------
// PUBLISH_NO_TOKEN=1 — игнорировать переменные окружения и положиться на
// настроенные в системе git-креды (в Replit бывает рабочий credential helper
// при постороннем GITHUB_TOKEN в окружении).
const TOKEN = process.env.PUBLISH_NO_TOKEN === '1'
  ? ''
  : (
    process.env.PUBLISH_GITHUB_TOKEN
    || process.env.GH_TOKEN
    || process.env.GITHUB_TOKEN
    || ''
  ).trim();

const AUTH_HEADER = TOKEN
  ? `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${TOKEN}`).toString('base64')}`
  : null;

const authArgs = () => (AUTH_HEADER ? ['-c', `http.https://github.com/.extraheader=${AUTH_HEADER}`] : []);

/**
 * Проверить право на запись до того, как собрано дерево целевого репозитория.
 * `git push --dry-run` у GitHub проверяет и доступ: без прав вернётся 403.
 */
const assertPushAccess = (directory, repository, branch) => {
  try {
    execFileSync('git', [...authArgs(), 'push', '--dry-run', 'origin', `HEAD:${branch}`], {
      cwd: directory,
      stdio: 'pipe',
    });
    return;
  } catch (error) {
    const stderr = String(error.stderr ?? '');
    if (/403|Permission to .* denied|Authentication failed/i.test(stderr)) {
      fail(
        `нет прав на запись в ${repository.repository}. `
        + 'Выдайте подключению Arena доступ к этому репозиторию (Arena → GitHub → '
        + 'выбор репозиториев) и повторите публикацию.',
      );
    }
    fail(`не удалось проверить доступ к ${repository.repository}: ${stderr.trim().split('\n')[0]}`);
  }
};

/** Свежий clone целевого репозитория в .publish/<name>. */
const ensureWorktree = (repository, workdir) => {
  fs.mkdirSync(workdir, { recursive: true });
  const directory = path.join(workdir, repository.repository.split('/')[1]);
  if (fs.existsSync(path.join(directory, '.git'))) {
    git(directory, 'fetch', '--depth', '1', 'origin', repository.branch);
    git(directory, 'reset', '--hard', `origin/${repository.branch}`);
    git(directory, 'clean', '-fdx');
    return directory;
  }
  execFileSync('git', [
    ...authArgs(),
    'clone', '--depth', '1', '--branch', repository.branch, repository.url, directory,
  ], { stdio: 'inherit' });
  return directory;
};

/** Очистить рабочее дерево целевого репозитория (кроме .git). */
const clearWorktree = (directory) => {
  for (const entry of fs.readdirSync(directory)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
  }
};

const copyFile = (source, target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  // Права переносим явно: copyFileSync создаёт файл по umask, и исполняемый
  // scripts/release.sh в целевом репозитории стал бы неисполняемым.
  fs.chmodSync(target, fs.statSync(source).mode);
};

const commitMessage = (args) => {
  if (args.message) return args.message;
  const head = git(ROOT, 'rev-parse', '--short', 'HEAD');
  const dirty = git(ROOT, 'status', '--porcelain').length > 0 ? ' + рабочее дерево' : '';
  return `Публикация из Fallout-2d20-companion @ ${head}${dirty}`;
};

const writePatch = (directory, patchFile) => {
  fs.mkdirSync(path.dirname(patchFile), { recursive: true });
  // git сам пишет патч в файл: diff дерева сеттинга — десятки мегабайт,
  // держать его в буфере процесса незачем.
  execFileSync('git', ['diff', '--cached', '--binary', '--output', patchFile], { cwd: directory });
  return fs.statSync(patchFile).size;
};

const finish = ({ args, directory, repository, report, workdir, label }) => {
  if (args.patch) {
    const patchFile = path.join(workdir, 'patches', `${label}.patch`);
    const bytes = writePatch(directory, patchFile);
    console.log(`[publish] ${label} patch: ${patchFile} (${bytes} bytes)`);
    report.patch = patchFile;
  }
  if (args.push) {
    commit(directory, commitMessage(args));
    git(directory, 'push', 'origin', `HEAD:${repository.branch}`);
    console.log(`[publish] ${label}: pushed`);
    report.pushed = true;
  } else if (!args.keep) {
    git(directory, 'reset', '--hard', 'HEAD');
    git(directory, 'clean', '-fdx');
  }
  if (args.keep) console.log(`[publish] ${label} tree kept: ${directory}`);
  return report;
};

const publishEngine = async (args, config) => {
  const repository = config.engine;
  if (!repository?.repository) fail('settings/repositories.json has no engine repository');
  const workdir = path.resolve(ROOT, args.workdir);
  const directory = ensureWorktree(repository, workdir);
  const files = planEngineFiles(ROOT);

  if (args.push) {
    assertPushAccess(directory, repository, repository.branch);
  }

  // app-release.json пишет только релизный сценарий движка (npm run release
  // там же, где собирается APK). Публикация кода его не трогает: то, что уже
  // лежит в репозитории, сохраняется как есть, иначе push откатил бы индекс
  // обновлений к прошлому релизу.
  const appReleasePath = path.join(directory, APP_RELEASE_FILE);
  const existingAppRelease = fs.existsSync(appReleasePath)
    ? fs.readFileSync(appReleasePath)
    : null;

  clearWorktree(directory);
  for (const relative of files) {
    copyFile(path.join(ROOT, relative), path.join(directory, relative));
  }

  if (existingAppRelease) {
    fs.writeFileSync(appReleasePath, existingAppRelease);
  }

  git(directory, 'add', '-A');
  const status = git(directory, 'status', '--porcelain');
  const report = {
    target: 'engine',
    repository: repository.repository,
    files: files.length,
    changed: status ? status.split('\n').length : 0,
    appRelease: existingAppRelease ? 'kept' : null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!status) {
    console.log('[publish] engine: no changes');
    return report;
  }
  return finish({ args, directory, repository, report, workdir, label: 'engine' });
};

const publishSetting = async (args, config) => {
  const repository = config.setting;
  if (!repository?.repository) fail('settings/repositories.json has no setting repository');
  const workdir = path.resolve(ROOT, args.workdir);
  const directory = ensureWorktree(repository, workdir);
  const wallets = planSettingWallets(ROOT, repository.wallets);
  const tools = planSettingToolFiles(ROOT);
  const releaseFiles = planSettingReleaseFiles(ROOT);
  // Заметки о релизах живут в репозитории сеттинга: правятся здесь,
  // публикуются туда, оттуда же берутся в текст GitHub Release. Проверяем
  // до клонирования/очистки дерева: без файла релиз там не выпустить.
  const noteSources = wallets.map((wallet) => {
    const notesFile = releaseNotesFile(wallet.id);
    const source = path.join(ROOT, notesFile);
    if (!fs.existsSync(source)) {
      fail(`нет ${notesFile}: без заметок релиз ${wallet.id} не выпустить`);
    }
    return { notesFile, source };
  });

  if (args.push) {
    assertPushAccess(directory, repository, repository.branch);
  }

  // release.json и версия в manifest.json — собственность репозитория
  // сеттинга: там собирается .trpg и выпускается релиз (scripts/release.mjs).
  // Публикация кода их не понижает: сохраняем текущий индекс и версии
  // манифестов, которые уже лежат в целевом репозитории.
  const previousReleaseFile = path.join(directory, RELEASE_INDEX_FILE);
  const previousRelease = fs.existsSync(previousReleaseFile)
    ? fs.readFileSync(previousReleaseFile, 'utf8')
    : null;
  const publishedVersions = previousRelease ? (JSON.parse(previousRelease).settings ?? {}) : {};
  const currentManifests = new Map();
  for (const wallet of wallets) {
    const file = path.join(directory, wallet.id, 'manifest.json');
    if (fs.existsSync(file)) currentManifests.set(wallet.id, JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  clearWorktree(directory);
  for (const wallet of wallets) {
    for (const relative of wallet.files) {
      copyFile(
        path.join(wallet.sourceDir, relative),
        path.join(directory, wallet.id, relative),
      );
    }
  }
  for (const tool of tools) {
    copyFile(path.join(ROOT, tool.from), path.join(directory, tool.to));
  }
  for (const relative of releaseFiles) {
    copyFile(path.join(ROOT, relative), path.join(directory, relative));
  }
  for (const name of planSettingLegalFiles(ROOT)) {
    copyFile(path.join(ROOT, name), path.join(directory, name));
  }
  for (const { notesFile, source } of noteSources) {
    copyFile(source, path.join(directory, notesFile));
  }
  fs.writeFileSync(path.join(directory, TOOLS_DIR, 'README.md'), renderToolsReadme());
  // Сборщик в репозитории сеттинга самодостаточен: esbuild ставится
  // в tools/node_modules, а список host-модулей приезжает из движка.
  const enginePackage = readJson(path.join(ROOT, 'package.json'));
  fs.writeFileSync(
    path.join(directory, TOOLS_DIR, 'package.json'),
    renderToolsPackageJson({ engineVersion: enginePackage.devDependencies?.esbuild }),
  );
  fs.writeFileSync(
    path.join(directory, TOOLS_DIR, 'host-modules.json'),
    `${JSON.stringify(hostModuleIds(ROOT), null, 2)}\n`,
  );
  fs.writeFileSync(path.join(directory, 'README.md'), renderSettingReadme({
    repository: repository.repository,
    wallets: repository.wallets,
    engineRepository: config.engine?.repository ?? 'rpg-companios/ttrpg-engine',
  }));

  // Версия релиза не откатывается исходниками: если в репозитории сеттинга
  // она выше, публикация сохраняет её.
  for (const wallet of wallets) {
    const current = currentManifests.get(wallet.id);
    if (!current) continue;
    const targetFile = path.join(directory, wallet.id, 'manifest.json');
    if (!fs.existsSync(targetFile)) continue;
    const incoming = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    const versioned = keepPublishedVersion(incoming, current);
    if (versioned !== incoming) {
      fs.writeFileSync(targetFile, `${JSON.stringify(versioned, null, 2)}\n`);
      console.log(`[publish] ${wallet.id}: версия ${incoming.version} → ${versioned.version} (из репозитория сеттинга)`);
    }
  }

  if (previousRelease) {
    fs.writeFileSync(previousReleaseFile, previousRelease);
  }

  git(directory, 'add', '-A');
  const status = git(directory, 'status', '--porcelain');
  const report = {
    target: 'setting',
    repository: repository.repository,
    wallets: wallets.map((wallet) => ({ id: wallet.id, files: wallet.files.length })),
    releaseScripts: releaseFiles.length,
    publishedVersions,
    changed: status ? status.split('\n').length : 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!status) {
    console.log('[publish] setting: no changes');
    return report;
  }
  return finish({ args, directory, repository, report, workdir, label: 'setting' });
};

const restartedForUpdate = () => {
  if (process.env.PUBLISH_SYNC_REEXEC === '1') {
    console.log('[publish] сценарий публикации уже перезапускался — продолжаю на текущей версии');
    return false;
  }
  console.log('[publish] сценарий публикации обновился — перезапускаю');
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, PUBLISH_SYNC_REEXEC: '1' } },
  );
  process.exit(child.status ?? 1);
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  if (args.pull) {
    const sync = syncCheckout({ root: ROOT, label: 'publish' });
    const scriptChanged = (sync.changed ?? []).some((file) => file.startsWith('scripts/'));
    if (sync.updated && scriptChanged) restartedForUpdate();
  } else {
    console.log('[publish] обновление из origin отключено (--no-pull)');
  }
  if (!fs.existsSync(args.config)) fail(`missing ${args.config}`);
  const config = readJson(args.config);
  console.log(`[publish] auth: ${TOKEN ? 'токен GitHub из окружения' : 'без токена (git credential helper / gh)'}`);
  const reports = [];
  if (args.target === 'all' || args.target === 'engine') reports.push(await publishEngine(args, config));
  if (args.target === 'all' || args.target === 'setting') reports.push(await publishSetting(args, config));
  console.log(JSON.stringify({ ok: true, reports }, null, 2));
};

main().catch((error) => {
  console.error(`[publish] ${error?.message ?? error}`);
  process.exit(1);
});
