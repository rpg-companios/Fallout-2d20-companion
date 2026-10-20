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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReleaseIndex,
  planEngineFiles,
  planSettingLegalFiles,
  planSettingToolFiles,
  planSettingWallets,
  RELEASE_INDEX_FILE,
  renderSettingReadme,
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
    config: DEFAULT_REPOSITORIES_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--target': args.target = argv[++index]; break;
      case '--workdir': args.workdir = argv[++index]; break;
      case '--message': args.message = argv[++index]; break;
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
  if (args.release && args.target === 'engine') fail('--release is supported for the setting repository only');
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
const TOKEN = (
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
  const notes = `Пакет сеттинга ${entry.id} версии ${entry.manifest.version}.`;

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

const buildTrpg = (wallet, outputFile) => {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  execFileSync('python3', [
    path.join(ROOT, 'scripts', 'pack-setting.py'),
    wallet.sourceDir,
    '--output', outputFile,
  ], { cwd: ROOT, stdio: 'inherit' });
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

const publishEngine = (args, config) => {
  const repository = config.engine;
  if (!repository?.repository) fail('settings/repositories.json has no engine repository');
  const workdir = path.resolve(ROOT, args.workdir);
  const directory = ensureWorktree(repository, workdir);
  const files = planEngineFiles(ROOT);

  if (args.push || args.release) {
    assertPushAccess(directory, repository, repository.branch);
  }

  clearWorktree(directory);
  for (const relative of files) {
    copyFile(path.join(ROOT, relative), path.join(directory, relative));
  }

  git(directory, 'add', '-A');
  const status = git(directory, 'status', '--porcelain');
  const report = {
    target: 'engine',
    repository: repository.repository,
    files: files.length,
    changed: status ? status.split('\n').length : 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!status) {
    console.log('[publish] engine: no changes');
    return report;
  }

  if (args.patch) {
    const patchFile = path.join(workdir, 'patches', 'engine.patch');
    const bytes = writePatch(directory, patchFile);
    console.log(`[publish] engine patch: ${patchFile} (${bytes} bytes)`);
    report.patch = patchFile;
  }
  if (args.push) {
    commit(directory, commitMessage(args));
    git(directory, 'push', 'origin', `HEAD:${repository.branch}`);
    console.log('[publish] engine: pushed');
    report.pushed = true;
  } else if (!args.keep) {
    git(directory, 'reset', '--hard', 'HEAD');
    git(directory, 'clean', '-fdx');
  }
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

  const artifactsDir = path.join(workdir, 'artifacts');
  const packages = wallets.map((wallet) => {
    const manifest = readJson(path.join(wallet.sourceDir, 'manifest.json'));
    if (args.release) {
      const artifact = buildTrpg(wallet, path.join(artifactsDir, wallet.asset));
      return {
        id: wallet.id,
        manifest,
        asset: wallet.asset,
        file: artifact,
        bytes: fs.statSync(artifact).size,
        sha256: sha256(artifact),
      };
    }
    return { id: wallet.id, manifest, asset: wallet.asset, file: null, bytes: null, sha256: null };
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
  fs.writeFileSync(path.join(directory, TOOLS_DIR, 'README.md'), renderToolsReadme());
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
  if (args.target === 'all' || args.target === 'engine') reports.push(publishEngine(args, config));
  if (args.target === 'all' || args.target === 'setting') reports.push(await publishSetting(args, config));
  console.log(JSON.stringify({ ok: true, reports }, null, 2));
};

main().catch((error) => {
  console.error(`[publish] ${error?.message ?? error}`);
  process.exit(1);
});
