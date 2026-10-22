#!/usr/bin/env node
// Публикация правок из этого (совмещённого) репозитория в целевые репозитории:
//
//   engine  → https://github.com/rpg-companios/ttrpg-engine        (APK)
//   setting → https://github.com/rpg-companios/positronium-game-settings (.trpg)
//
// Порядок работы владельца: сначала правим здесь, потом запускаем скрипт.
// Скрипт собирает дерево целевого репозитория из текущего checkout, пишет
// патч (--patch), коммитит и пушит (--push), а для сеттинга собирает `.trpg`,
// обновляет release.json и создаёт релиз GitHub (--release) — по нему клиент
// и узнаёт о новой версии.
//
// Примеры:
//   node scripts/publish-repositories.mjs                     # план, ничего не меняет
//   node scripts/publish-repositories.mjs --target engine --patch
//   node scripts/publish-repositories.mjs --target setting --push --release
//
// Без --push/--release скрипт работает как «показать, что уедет»: клонирует
// целевой репозиторий в .publish/ и печатает список изменений.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_RELEASE_FILE,
  buildAppReleaseIndex,
  buildReleaseIndex,
  ENGINE_APK_ASSET,
  ENGINE_RELEASE_NOTES,
  engineReleaseTag,
  hostModuleIds,
  isLegacyReleaseTag,
  nextReleaseVersion,
  planEngineFiles,
  planSettingLegalFiles,
  planSettingToolFiles,
  planSettingWallets,
  readEngineVersion,
  readReleaseNotes,
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

const parseArguments = (argv) => {
  const args = {
    target: 'all',
    workdir: '.publish',
    patch: false,
    push: false,
    release: false,
    message: null,
    keep: false,
    // Каждый релиз — шаг по семантической версии; по умолчанию патч.
    bump: 'patch',
    version: null,
    pruneLegacy: true,
    // Файлы, которые прикладываются к релизу движка (APK/AAB после EAS).
    assets: [],
    config: DEFAULT_REPOSITORIES_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--target': args.target = argv[++index]; break;
      case '--workdir': args.workdir = argv[++index]; break;
      case '--message': args.message = argv[++index]; break;
      case '--bump': args.bump = argv[++index]; break;
      case '--version': args.version = argv[++index]; break;
      case '--asset': args.assets.push(path.resolve(argv[++index])); break;
      case '--no-prune-legacy': args.pruneLegacy = false; break;
      case '--config': args.config = path.resolve(argv[++index]); break;
      case '--patch': args.patch = true; break;
      case '--push': args.push = true; break;
      case '--release': args.release = true; break;
      case '--keep': args.keep = true; break;
      default:
        fail(`unknown argument: ${argument}`);
    }
  }
  if (!['all', 'engine', 'setting'].includes(args.target)) fail(`unknown target: ${args.target}`);
  if (!['patch', 'minor', 'major'].includes(args.bump)) {
    fail(`unknown --bump level: ${args.bump} (expected patch|minor|major)`);
  }
  if (args.release && args.target === 'setting' && args.assets.length > 0) {
    fail('--asset is for engine releases (APK/AAB); the setting release uploads the built .trpg');
  }
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
const hasCommand = (command) => {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// ---------------------------------------------------------------------------
// Авторизация.
//
// В Replit и CI git обычно не имеет настроенного credential helper, поэтому
// токен берём из окружения и передаём git'у заголовком на один вызов: в
// .git/config он не попадает. Тот же токен нужен REST API для релиза.
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

// Переопределение для тестов: локальный сервер вместо GitHub API.
const API_BASE = process.env.PUBLISH_API_BASE || 'https://api.github.com';
const UPLOAD_BASE = process.env.PUBLISH_UPLOAD_BASE || 'https://uploads.github.com';

const apiHeaders = () => ({
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'positronium-publish',
});

/** Запрос к GitHub API с разбором JSON и внятной ошибкой. */
const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...apiHeaders(), ...(options.headers ?? {}) } });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
};

const describeApiError = (result) => (
  (result.body && (result.body.message || result.body.documentation_url))
  || `HTTP ${result.status}`
);

/** Найти или создать релиз; существующий — переиспользуем. */
const ensureRelease = async ({ repository, tag, title, notes, branch }) => {
  const created = await apiRequest(`${API_BASE}/repos/${repository}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: title, body: notes, target_commitish: branch }),
  });
  if (created.ok) return created.body;

  const existing = await apiRequest(`${API_BASE}/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.ok) return existing.body;

  fail(`не удалось создать релиз ${tag} в ${repository}: ${describeApiError(created)}`);
  return null;
};

/** Положить ассет в релиз; одноимённый старый — удалить (--clobber). */
const uploadReleaseAsset = async ({ repository, releaseId, file, name }) => {
  const assets = await apiRequest(`${API_BASE}/repos/${repository}/releases/${releaseId}/assets?per_page=100`);
  if (assets.ok && Array.isArray(assets.body)) {
    for (const asset of assets.body) {
      if (asset.name !== name) continue;
      const removed = await apiRequest(`${API_BASE}/repos/${repository}/releases/assets/${asset.id}`, {
        method: 'DELETE',
      });
      if (!removed.ok) {
        fail(`не удалось заменить ассет ${name} в ${repository}: ${describeApiError(removed)}`);
      }
    }
  }

  const bytes = fs.readFileSync(file);
  const uploaded = await apiRequest(`${UPLOAD_BASE}/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!uploaded.ok) fail(`не удалось загрузить ${name} в ${repository}: ${describeApiError(uploaded)}`);
  return uploaded.body;
};

/** Релиз через gh, если токена нет, но gh авторизован. */
const publishReleaseWithGh = ({ repository, tag, title, notes, file, id }) => {
  const exists = (() => {
    try {
      execFileSync('gh', ['release', 'view', tag, '--repo', repository], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  if (exists) {
    execFileSync('gh', ['release', 'upload', tag, file, '--repo', repository, '--clobber'], { stdio: 'inherit' });
    return;
  }
  execFileSync('gh', [
    'release', 'create', tag, file,
    '--repo', repository,
    '--title', title,
    '--notes', notes,
  ], { stdio: 'inherit' });
};

const publishRelease = async ({ repository, branch, entry }) => {
  const tag = `${entry.id}-v${entry.manifest.version}`;
  const title = `${entry.manifest.name ?? entry.id} ${entry.manifest.version}`;
  // Текст релиза — верхняя секция release-notes/<id>.md; версию уже сверили
  // при сборке пакета, поэтому заметки и архив всегда про один номер.
  const notes = [
    entry.notes?.title ? `## ${entry.manifest.version} — ${entry.notes.title}` : `## ${entry.manifest.version}`,
    '',
    entry.notes?.body ?? '',
  ].join('\n').trim();

  if (TOKEN) {
    const release = await ensureRelease({
      repository: repository.repository, tag, title, notes, branch,
    });
    await uploadReleaseAsset({
      repository: repository.repository,
      releaseId: release.id,
      file: entry.file,
      name: entry.asset,
    });
  } else if (hasCommand('gh')) {
    publishReleaseWithGh({
      repository: repository.repository, tag, title, notes, file: entry.file,
    });
  } else {
    fail(
      'для релиза нужен токен GitHub: задайте GH_TOKEN (или GITHUB_TOKEN) '
      + 'либо авторизуйте gh CLI',
    );
  }
  console.log(`[publish] release: ${tag} → ${repository.repository}`);
};

/**
 * Релиз движка: тег `engine-v<версия>`, APK/AAB — ассетами.
 *
 * Сборку APK делает EAS (или локальный Gradle) — публикация не собирает
 * приложение, она только прикладывает готовые файлы. Без `--asset` релиз
 * создаётся с описанием, файл можно добавить позже.
 */
const publishEngineRelease = async ({ repository, release, assets }) => {
  const notesBody = [
    release.notes.title ? `## ${release.version} — ${release.notes.title}` : `## ${release.version}`,
    '',
    release.notes.body ?? '',
  ].join('\n').trim();
  const title = `Positronium ${release.version}`;

  if (TOKEN) {
    const created = await ensureRelease({
      repository: repository.repository,
      tag: release.tag,
      title,
      notes: notesBody,
      branch: repository.branch,
    });
    for (const asset of assets) {
      const staged = stageEngineAsset(asset);
      try {
        await uploadReleaseAsset({
          repository: repository.repository,
          releaseId: created.id,
          file: staged.file,
          name: staged.name,
        });
      } finally {
        staged.cleanup();
      }
    }
  } else if (hasCommand('gh')) {
    const base = ['--repo', repository.repository];
    let exists = true;
    try {
      execFileSync('gh', ['release', 'view', release.tag, ...base], { stdio: 'ignore' });
    } catch {
      exists = false;
    }
    // Постоянные имена ассетов: gh берёт имя из файла — готовим копии.
    const staged = assets.map(stageEngineAsset);
    try {
      if (exists) {
        for (const asset of staged) {
          execFileSync('gh', ['release', 'upload', release.tag, asset.file, ...base, '--clobber'], {
            stdio: 'inherit',
          });
        }
      } else {
        execFileSync('gh', [
          'release', 'create', release.tag, ...staged.map((asset) => asset.file),
          ...base,
          '--target', repository.branch,
          '--title', title,
          '--notes', notesBody,
        ], { stdio: 'inherit' });
      }
    } finally {
      for (const asset of staged) asset.cleanup();
    }
  } else {
    fail(
      'для релиза нужен токен GitHub: задайте PUBLISH_GITHUB_TOKEN (или GH_TOKEN) '
      + 'либо авторизуйте gh CLI',
    );
  }
  console.log(`[publish] engine release: ${release.tag} → ${repository.repository}`);
};

/**
 * Убрать релизы и теги до-семантической нумерации (`fallout-v1`).
 *
 * Старые теги не должны висеть рядом с `fallout-v1.0.0`: клиент сравнивает
 * версии из release.json, а человек — список релизов, и «v1» рядом с «v1.0.0»
 * только путает. Удаляются лишь теги этого кошелька, у которых после `-v`
 * стоит целое число.
 */
const pruneLegacyReleases = async ({ repository, settingId, dryRun }) => {
  const removed = [];
  const releases = await apiRequest(`${API_BASE}/repos/${repository}/releases?per_page=100`);
  if (!releases.ok) {
    if (!dryRun) console.log(`[publish] prune: не удалось прочитать релизы (HTTP ${releases.status})`);
    return removed;
  }
  for (const release of Array.isArray(releases.body) ? releases.body : []) {
    if (!isLegacyReleaseTag(settingId, release.tag_name)) continue;
    removed.push(release.tag_name);
    if (dryRun) continue;
    if (TOKEN) {
      const deleted = await apiRequest(`${API_BASE}/repos/${repository}/releases/${release.id}`, {
        method: 'DELETE',
      });
      if (!deleted.ok) {
        fail(`не удалось удалить старый релиз ${release.tag_name}: ${describeApiError(deleted)}`);
      }
      // Удаление релиза оставляет тег: снимаем и его.
      await apiRequest(`${API_BASE}/repos/${repository}/git/refs/tags/${encodeURIComponent(release.tag_name)}`, {
        method: 'DELETE',
      });
    } else if (hasCommand('gh')) {
      execFileSync('gh', ['release', 'delete', release.tag_name, '--repo', repository, '--yes', '--cleanup-tag'], {
        stdio: 'inherit',
      });
    }
  }
  return removed;
};

/**
 * Проверить право на запись до того, как собран 20-мегабайтный .trpg.
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
};

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Имя ассета в релизе. APK всегда называется positronium.apk: по этому
// имени собирается постоянная ссылка /releases/latest/download/, которую
// можно давать людям навсегда (docs/publishing.md).
const engineAssetName = (file) => (/\.[aA][pP][kK]$/.test(file) ? ENGINE_APK_ASSET : path.basename(file));

/** Файл под нужным именем: gh upload берёт имя из файла, поэтому копируем. */
const stageEngineAsset = (file) => {
  const name = engineAssetName(file);
  if (name === path.basename(file)) return { file, name, cleanup: () => {} };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-asset-'));
  const target = path.join(directory, name);
  fs.copyFileSync(file, target);
  return { file: target, name, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
};

// Строки для окна «Доступна новая версия»: клиент рисует их списком, поэтому
// отдаём пункты, а не переносы markdown. Абзац склеивается в одну строку
// (иначе окно покажет обрывки фраз), маркеры списка снимаются.
const appReleaseNotes = (notes) => {
  const lines = [];
  if (notes?.title) lines.push(notes.title);

  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  };
  for (const raw of String(notes?.body ?? '').split('\n')) {
    const line = raw.replace(/^\s*[-*]\s+/, '').trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('#')) continue;
    current.push(line);
  }
  flush();

  for (const paragraph of paragraphs) {
    if (paragraph) lines.push(paragraph);
  }
  return lines.length > 0 ? { 'ru-RU': lines } : {};
};

// .trpg собирается esbuild'ом (devDependency движка). Проверяем заранее:
// иначе упаковщик упадёт уже после клонирования и десятков скопированных файлов.
//
// Ставить сборщик в дерево проекта нельзя: в Replit node_modules может быть
// создан pnpm, и `npm install` поверх такого дерева падает
// («Cannot read properties of null (reading 'isDescendantOf')»). Поэтому
// отсутствующий esbuild ставится в отдельный кэш вне репозитория, а путь к
// нему передаётся дочерним процессам через NODE_PATH.
const TOOL_CACHE_DIR = process.env.POSITRONIUM_TOOLS_DIR
  || path.join(os.tmpdir(), 'positronium-build-tools');

const esbuildVersion = () => {
  try {
    return readJson(path.join(ROOT, 'package.json'))?.devDependencies?.esbuild || 'latest';
  } catch {
    return 'latest';
  }
};

/** Путь к node_modules с esbuild (кэш вне проекта) или null. */
const ensurePackToolchain = () => {
  try {
    createRequire(path.join(ROOT, 'package.json')).resolve('esbuild');
    return null; // сборщик уже доступен из проекта, NODE_PATH не нужен
  } catch {
    // ставим в изолированный кэш
  }
  if (!hasCommand('npm')) {
    fail('для сборки .trpg нужен esbuild: выполните "npm install" в корне движка');
  }

  const nodeModules = path.join(TOOL_CACHE_DIR, 'node_modules');
  const cached = path.join(nodeModules, 'esbuild', 'lib', 'main.js');
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(TOOL_CACHE_DIR, { recursive: true });
    // Свой package.json не даёт npm уйти вверх по дереву к чужому проекту.
    const guard = path.join(TOOL_CACHE_DIR, 'package.json');
    if (!fs.existsSync(guard)) {
      fs.writeFileSync(guard, `${JSON.stringify({ name: 'positronium-build-tools', private: true })}\n`);
    }
    const version = esbuildVersion();
    console.log(`[publish] esbuild не найден — ставлю esbuild@${version} в ${TOOL_CACHE_DIR}`);
    try {
      execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', `esbuild@${version}`], {
        cwd: TOOL_CACHE_DIR,
        stdio: 'inherit',
      });
    } catch {
      fail(
        'не удалось поставить esbuild. Выполните вручную: '
        + `npm install --prefix ${TOOL_CACHE_DIR} esbuild`,
      );
    }
  }
  return nodeModules;
};

const withNodePath = (nodeModules) => {
  if (!nodeModules) return process.env;
  const current = process.env.NODE_PATH;
  return {
    ...process.env,
    NODE_PATH: current ? `${nodeModules}${path.delimiter}${current}` : nodeModules,
  };
};

const buildTrpg = (wallet, outputFile, nodeModules) => {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  execFileSync('python3', [
    path.join(ROOT, 'scripts', 'pack-setting.py'),
    wallet.sourceDir,
    '--output', outputFile,
  ], { cwd: ROOT, stdio: 'inherit', env: withNodePath(nodeModules) });
  return outputFile;
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

const publishEngine = async (args, config) => {
  const repository = config.engine;
  if (!repository?.repository) fail('settings/repositories.json has no engine repository');
  const workdir = path.resolve(args.workdir);
  const directory = ensureWorktree(repository, workdir);
  const files = planEngineFiles(ROOT);

  if (args.push || args.release) {
    assertPushAccess(directory, repository, repository.branch);
  }

  // Релиз движка: версия одна на app.json и ENGINE_VERSION, текст — из
  // верхней секции release-notes/engine.md. Проверяем до клонирования
  // и копирования файлов, чтобы не гонять дерево впустую.
  let release = null;
  let appRelease = null;
  if (args.release) {
    const version = readEngineVersion(ROOT);
    const notes = readReleaseNotes(ROOT, 'engine');
    if (!notes) fail(`нет файла заметок ${ENGINE_RELEASE_NOTES}: без него релиз не выпускается`);
    if (notes.version !== version) {
      fail(
        `верхняя секция ${ENGINE_RELEASE_NOTES} — ${notes.version}, `
        + `а публикуется ${version}. Добавьте раздел "## ${version}" в начало файла.`,
      );
    }
    for (const asset of args.assets) {
      if (!fs.existsSync(asset) || !fs.statSync(asset).isFile()) {
        fail(`--asset: файл не найден: ${asset}`);
      }
    }
    // Игроки узнают о релизе из приложения и качают APK по постоянной
    // ссылке — значит, релиз движка без APK бессмысленен: обновляться
    // будет не на что. AAB (для Play) можно приложить дополнительно.
    const apk = args.assets.find((asset) => /\.[aA][pP][kK]$/.test(asset));
    if (!apk) {
      fail(
        'релиз движка требует APK (--asset path/to/app-release.apk): '
        + 'по нему собирается постоянная ссылка обновления и app-release.json',
      );
    }
    release = { version, tag: engineReleaseTag(version), notes };
    appRelease = buildAppReleaseIndex({
      repository: repository.repository,
      version,
      notes: appReleaseNotes(notes),
      asset: ENGINE_APK_ASSET,
      bytes: fs.statSync(apk).size,
      sha256: sha256(apk),
    });
  }

  // app-release.json не входит в план файлов: его содержимое знает только
  // публикация. Без релиза сохраняем тот, что уже лежит в репозитории, —
  // иначе обычный push затёр бы индекс обновлений прошлым состоянием.
  const appReleasePath = path.join(directory, APP_RELEASE_FILE);
  const existingAppRelease = fs.existsSync(appReleasePath)
    ? fs.readFileSync(appReleasePath)
    : null;

  clearWorktree(directory);
  for (const relative of files) {
    copyFile(path.join(ROOT, relative), path.join(directory, relative));
  }

  if (appRelease) {
    fs.writeFileSync(appReleasePath, `${JSON.stringify(appRelease, null, 2)}\n`);
  } else if (existingAppRelease) {
    fs.writeFileSync(appReleasePath, existingAppRelease);
  }

  git(directory, 'add', '-A');
  const status = git(directory, 'status', '--porcelain');
  const report = {
    target: 'engine',
    repository: repository.repository,
    files: files.length,
    changed: status ? status.split('\n').length : 0,
    release: release ? { tag: release.tag, version: release.version, assets: args.assets } : null,
    appRelease: appRelease
      ? { version: appRelease.version, asset: appRelease.asset, bytes: appRelease.bytes }
      : (existingAppRelease ? 'kept' : null),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!status) {
    console.log('[publish] engine: no changes');
    if (release) await publishEngineRelease({ repository, release, assets: args.assets });
    return report;
  }

  if (args.patch) {
    const patchFile = path.join(workdir, 'patches', 'engine.patch');
    const bytes = writePatch(directory, patchFile);
    console.log(`[publish] engine patch: ${patchFile} (${bytes} bytes)`);
    report.patch = patchFile;
  }
  if (args.push || args.release) {
    commit(directory, commitMessage(args));
    git(directory, 'push', 'origin', `HEAD:${repository.branch}`);
    console.log('[publish] engine: pushed');
    report.pushed = true;
  } else if (!args.keep) {
    git(directory, 'reset', '--hard', 'HEAD');
    git(directory, 'clean', '-fdx');
  }
  if (release) await publishEngineRelease({ repository, release, assets: args.assets });
  if (args.keep) console.log(`[publish] engine tree kept: ${directory}`);
  return report;
};

const publishSetting = async (args, config) => {
  const repository = config.setting;
  if (!repository?.repository) fail('settings/repositories.json has no setting repository');
  const workdir = path.resolve(ROOT, args.workdir);
  const directory = ensureWorktree(repository, workdir);
  const wallets = planSettingWallets(ROOT, repository.wallets);
  const tools = planSettingToolFiles(ROOT);

  if (args.push || args.release) {
    assertPushAccess(directory, repository, repository.branch);
  }

  // Предыдущий release.json нужен, если сейчас выпускаем не релиз:
  // клиенты должны продолжать видеть последний выпущенный пакет.
  const previousReleaseFile = path.join(directory, RELEASE_INDEX_FILE);
  const previousRelease = fs.existsSync(previousReleaseFile)
    ? fs.readFileSync(previousReleaseFile, 'utf8')
    : null;

  // Проверяем сборщик до сборки релиза и подставляем его дочерним процессам.
  const toolNodeModules = args.release ? ensurePackToolchain() : null;

  const publishedVersions = previousRelease
    ? (JSON.parse(previousRelease).settings ?? {})
    : {};

  const artifactsDir = path.join(workdir, 'artifacts');
  const packages = wallets.map((wallet) => {
    const manifestFile = path.join(wallet.sourceDir, 'manifest.json');
    const manifest = readJson(manifestFile);
    if (!args.release) {
      return { id: wallet.id, manifest, asset: wallet.asset, file: null, bytes: null, sha256: null };
    }

    // Версия и заметки проверяются до сборки: 20-мегабайтный архив незачем
    // собирать, если номер не совпал с верхней секцией заметок.
    const version = nextReleaseVersion({
      manifestVersion: String(manifest.version),
      publishedVersion: publishedVersions[wallet.id]?.version,
      level: args.bump,
      explicitVersion: args.version,
    });
    const notes = readReleaseNotes(ROOT, wallet.id);
    if (!notes) {
      fail(`нет файла заметок ${releaseNotesFile(wallet.id)}: без него релиз не выпускается`);
    }
    if (notes.version !== version) {
      fail(
        `верхняя секция ${releaseNotesFile(wallet.id)} — ${notes.version}, `
        + `а публикуется ${version}. Добавьте раздел "## ${version}" в начало файла.`,
      );
    }

    if (String(manifest.version) !== version) {
      // Номер живёт в манифесте кошелька: публикация поднимает его здесь,
      // чтобы следующий выпуск считался от него же.
      fs.writeFileSync(manifestFile, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
      console.log(`[publish] ${wallet.id}: версия ${manifest.version} → ${version} (манифест обновлён)`);
      manifest.version = version;
    }

    const artifact = buildTrpg(wallet, path.join(artifactsDir, wallet.asset), toolNodeModules);
    return {
      id: wallet.id,
      manifest,
      asset: wallet.asset,
      file: artifact,
      bytes: fs.statSync(artifact).size,
      sha256: sha256(artifact),
      version,
      notes,
    };
  });

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
  const legalFiles = planSettingLegalFiles(ROOT);
  for (const name of legalFiles) {
    copyFile(path.join(ROOT, name), path.join(directory, name));
  }
  // Заметки о релизах живут в репозитории сеттинга: правятся здесь,
  // публикуются туда, оттуда же берутся в текст GitHub Release.
  for (const wallet of wallets) {
    const notesFile = releaseNotesFile(wallet.id);
    const source = path.join(ROOT, notesFile);
    if (fs.existsSync(source)) copyFile(source, path.join(directory, notesFile));
  }
  fs.writeFileSync(path.join(directory, TOOLS_DIR, 'README.md'), renderToolsReadme());
  // Сборщик в репозитории сеттинга самодостаточен: esbuild ставится
  // в tools/node_modules, а список host-модулей приезжает из движка.
  const engineDeps = readJson(path.join(ROOT, 'package.json'));
  fs.writeFileSync(
    path.join(directory, TOOLS_DIR, 'package.json'),
    renderToolsPackageJson({ engineVersion: engineDeps.devDependencies?.esbuild }),
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

  if (args.release) {
    const index = buildReleaseIndex({
      repository: repository.repository,
      packages: packages.map((entry) => ({
        id: entry.id,
        manifest: entry.manifest,
        asset: entry.asset,
        sha256: entry.sha256,
        bytes: entry.bytes,
      })),
    });
    fs.writeFileSync(
      path.join(directory, RELEASE_INDEX_FILE),
      `${JSON.stringify(index, null, 2)}\n`,
    );
  } else if (previousRelease) {
    fs.writeFileSync(path.join(directory, RELEASE_INDEX_FILE), previousRelease);
  }

  git(directory, 'add', '-A');
  const status = git(directory, 'status', '--porcelain');
  const report = {
    target: 'setting',
    repository: repository.repository,
    wallets: wallets.map((wallet) => ({ id: wallet.id, files: wallet.files.length })),
    legal: legalFiles,
    changed: status ? status.split('\n').length : 0,
    release: args.release
      ? packages.map((entry) => ({
        id: entry.id,
        version: entry.manifest.version,
        asset: entry.asset,
        bytes: entry.bytes,
        sha256: entry.sha256,
      }))
      : null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!status) {
    console.log('[publish] setting: no changes');
    return report;
  }

  if (args.patch) {
    const patchFile = path.join(workdir, 'patches', 'setting.patch');
    const bytes = writePatch(directory, patchFile);
    console.log(`[publish] setting patch: ${patchFile} (${bytes} bytes)`);
    report.patch = patchFile;
  }

  if (args.push || args.release) {
    commit(directory, commitMessage(args));
    git(directory, 'push', 'origin', `HEAD:${repository.branch}`);
    console.log('[publish] setting: pushed');
    report.pushed = true;
  }

  if (args.release) {
    for (const entry of packages) {
      await publishRelease({ repository, branch: repository.branch, entry });
    }
    report.released = true;
    if (args.pruneLegacy) {
      for (const entry of packages) {
        const removed = await pruneLegacyReleases({
          repository: repository.repository,
          settingId: entry.id,
          dryRun: false,
        });
        if (removed.length > 0) {
          console.log(`[publish] ${entry.id}: убраны старые релизы ${removed.join(', ')}`);
          report.pruned = [...(report.pruned ?? []), ...removed];
        }
      }
    }
  } else if (!args.push && !args.keep) {
    git(directory, 'reset', '--hard', 'HEAD');
    git(directory, 'clean', '-fdx');
  }
  if (args.keep) console.log(`[publish] setting tree kept: ${directory}`);
  return report;
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
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
