#!/usr/bin/env node
// scripts/release.mjs
// Релиз ОДНОЙ командой — в том репозитории, где живёт артефакт.
//
// Скрипт универсальный и едет в оба целевых репозитория:
//
//   движок  (app.json + release-notes/engine.md)
//     npm run release                  # APK → GitHub Release → app-release.json
//     npm run release -- --aab         # AAB (файл для Google Play) в релиз
//     npm run release -- --aab --submit  # плюс загрузка AAB в Play Console
//
//   сеттинг (<id>/manifest.json + tools/pack-setting.py)
//     ./scripts/release.sh             # .trpg → GitHub Release → release.json
//     ./scripts/release.sh --bump minor
//     ./scripts/release.sh --version 1.2.0
//     ./scripts/release.sh --setting fallout
//
// Общие правила: версия — MAJOR.MINOR.PATCH, верхняя секция
// release-notes/<id>.md обязана совпадать с выпускаемым номером, ассет
// называется одинаково от релиза к релизу, а индекс обновлений коммитится
// в репозиторий.
//
// Токен: gh CLI (если авторизован) или GH_TOKEN / GITHUB_TOKEN /
// PUBLISH_GITHUB_TOKEN. Сборка APK идёт под аккаунтом Expo (`npx eas-cli login`).

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_RELEASE_FILE,
  ENGINE_AAB_ASSET,
  ENGINE_APK_ASSET,
  ENGINE_RELEASE_NOTES,
  buildAppReleaseIndex,
  engineReleaseTag,
  readEngineVersion,
  renderAppReleaseIndex,
  renderReleaseBody,
} from './lib/app-release.mjs';
import { readReleaseNotes } from './lib/release-notes.mjs';
import { nextReleaseVersion } from './lib/semver.mjs';
import {
  RELEASE_INDEX_FILE,
  buildReleaseIndex,
  isLegacyReleaseTag,
  releaseNotesFile,
  releaseTag,
} from './lib/setting-release.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// GitHub Actions выставляет GITHUB_API_URL; тем же способом подменяем API
// в проверках (локальный сервер вместо github.com).
const API_BASE = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const UPLOAD_BASE = API_BASE === 'https://api.github.com'
  ? 'https://uploads.github.com'
  : `${API_BASE}/uploads`;

const fail = (message) => {
  console.error(`[release] ${message}`);
  process.exit(1);
};

const run = (command, args, { cwd = ROOT, env = process.env } = {}) => {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim();
    const stdout = String(error?.stdout ?? '').trim();
    fail(`${command} ${args.join(' ')} не удался\n${stderr || stdout || error?.message}`);
    return '';
  }
};

const hasCommand = (command) => {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const baseArgs = (argv) => {
  const args = {
    aab: false,
    submit: false,
    buildId: null,
    skipBuild: false,
    dryRun: false,
    repository: null,
    bump: 'patch',
    version: null,
    setting: null,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--aab': args.aab = true; break;
      case '--submit': args.submit = true; break;
      case '--skip-build': args.skipBuild = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--build-id':
        args.buildId = argv[++index];
        if (!args.buildId) fail('--build-id требует идентификатор сборки EAS');
        break;
      case '--repo':
        args.repository = argv[++index];
        if (!args.repository) fail('--repo требует owner/name');
        break;
      case '--bump':
        args.bump = argv[++index];
        if (!['patch', 'minor', 'major'].includes(args.bump)) fail('--bump: patch|minor|major');
        break;
      case '--version':
        args.version = argv[++index];
        if (!args.version) fail('--version требует номер MAJOR.MINOR.PATCH');
        break;
      case '--setting':
        args.setting = argv[++index];
        if (!args.setting) fail('--setting требует id сеттинга');
        break;
      case '-h':
      case '--help':
        console.log('release — сборка и публикация релиза (движок: APK/AAB, сеттинг: .trpg)');
        console.log('см. комментарий в начале scripts/release.mjs');
        process.exit(0);
        break;
      default:
        fail(`неизвестный аргумент: ${arg}`);
    }
  }
  return args;
};

/** owner/name из git remote origin (github.com/owner/repo[.git]). */
const repositoryFromGit = () => {
  const url = run('git', ['remote', 'get-url', 'origin']).trim();
  const match = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!match) fail(`не удалось понять репозиторий из origin: ${url}. Передайте --repo owner/name`);
  return `${match[1]}/${match[2]}`;
};

const currentBranch = () => {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  return branch === 'HEAD' ? 'main' : branch;
};

const token = () => (
  process.env.PUBLISH_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
);

/** GitHub Release: gh CLI, а без него — REST по токену. */
const createRelease = async ({ repository, tag, title, body, file, assetName }) => {
  const branch = currentBranch();
  if (hasCommand('gh')) {
    let exists = true;
    try {
      execFileSync('gh', ['release', 'view', tag, '--repo', repository], { stdio: 'ignore' });
    } catch {
      exists = false;
    }
    const notesFile = `${file}.notes.md`;
    fs.writeFileSync(notesFile, body);
    if (exists) {
      // Повторный запуск: обновляем подпись и текст, ассет заменяем.
      execFileSync('gh', [
        'release', 'edit', tag,
        '--repo', repository,
        '--title', title,
        '--notes-file', notesFile,
      ], { stdio: 'inherit' });
      execFileSync('gh', ['release', 'upload', tag, file, '--repo', repository, '--clobber'], { stdio: 'inherit' });
      fs.rmSync(notesFile, { force: true });
      return;
    }
    execFileSync('gh', [
      'release', 'create', tag, file,
      '--repo', repository,
      '--target', branch,
      '--title', title,
      '--notes-file', notesFile,
    ], { stdio: 'inherit' });
    fs.rmSync(notesFile, { force: true });
    return;
  }

  const key = token();
  if (!key) fail('для релиза нужен gh CLI или токен GH_TOKEN / PUBLISH_GITHUB_TOKEN');

  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'positronium-release',
  };
  const created = await fetch(`${API_BASE}/repos/${repository}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: title, body, target_commitish: branch }),
  });
  let release = null;
  if (created.ok) {
    release = await created.json();
  } else {
    const existing = await fetch(`${API_BASE}/repos/${repository}/releases/tags/${tag}`, { headers });
    if (!existing.ok) fail(`не удалось создать релиз ${tag} (HTTP ${created.status})`);
    release = await existing.json();
    // Повторный запуск: текст релиза должен соответствовать заметкам.
    await fetch(`${API_BASE}/repos/${repository}/releases/${release.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: title, body }),
    });
  }

  const assets = await fetch(`${API_BASE}/repos/${repository}/releases/${release.id}/assets?per_page=100`, { headers });
  if (assets.ok) {
    for (const asset of await assets.json()) {
      if (asset.name !== assetName) continue;
      await fetch(`${API_BASE}/repos/${repository}/releases/assets/${asset.id}`, {
        method: 'DELETE',
        headers,
      });
    }
  }

  const upload = await fetch(
    `${UPLOAD_BASE}/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: fs.readFileSync(file),
    },
  );
  if (!upload.ok && upload.status !== 422) {
    fail(`не удалось загрузить ${assetName} в релиз ${tag} (HTTP ${upload.status})`);
  }
};

/** Закоммитить и запушить изменённые файлы релиза. */
const commitRelease = ({ files, message }) => {
  const status = run('git', ['status', '--porcelain', '--', ...files]).trim();
  if (!status) {
    console.log('[release] индекс не изменился — коммит не нужен');
    return false;
  }
  run('git', ['add', ...files]);
  // Подпись коммита: у свежего клона может не быть git identity, а релиз
  // не должен требовать ручной настройки.
  run('git', [
    '-c', `user.name=${process.env.PUBLISH_GIT_NAME || 'Positronium release'}`,
    '-c', `user.email=${process.env.PUBLISH_GIT_EMAIL || 'release@positronium.local'}`,
    'commit', '-m', message,
  ]);
  run('git', ['push', 'origin', `HEAD:${currentBranch()}`]);
  console.log('[release] изменения закоммичены и отправлены');
  return true;
};

// --- движок ---------------------------------------------------------------

/** JSON из stdout команды EAS: логи идут в stderr, stdout — только данные. */
const parseJson = (text, what) => {
  const trimmed = String(text ?? '').trim();
  const start = trimmed.search(/[[{]/);
  if (start === -1) fail(`${what}: EAS не вернул JSON`);
  try {
    return JSON.parse(trimmed.slice(start));
  } catch (error) {
    fail(`${what}: не разобрать JSON EAS (${error.message})`);
    return null;
  }
};

const eas = (args) => run('npx', ['eas-cli', ...args]);

const resolveBuild = ({ args, profile }) => {
  if (args.buildId) return parseJson(eas(['build:view', args.buildId, '--json']), 'build:view');
  if (args.skipBuild) {
    const list = parseJson(
      eas(['build:list', '--platform', 'android', '--status', 'finished', '--build-profile', profile, '--limit', '1', '--json']),
      'build:list',
    );
    const build = Array.isArray(list) ? list[0] : null;
    if (!build) fail(`нет успешных сборок профиля ${profile}; уберите --skip-build`);
    return build;
  }

  console.log(`[release] EAS build: профиль ${profile} (это займёт несколько минут)`);
  const builds = parseJson(
    eas(['build', '--platform', 'android', '--profile', profile, '--non-interactive', '--wait', '--json']),
    'build',
  );
  const build = Array.isArray(builds) ? builds[0] : builds;
  if (!build) fail('EAS не вернул сборку');
  if (String(build.status).toLowerCase() !== 'finished') {
    fail(`сборка ${build.id} завершилась со статусом ${build.status}; лог: ${build.logsUrl ?? 'см. expo.dev'}`);
  }
  return build;
};

const downloadArtifact = async (build) => {
  const url = build?.artifacts?.applicationArchiveUrl;
  if (!url) fail(`у сборки ${build?.id ?? '?'} нет файла (artifacts.applicationArchiveUrl)`);
  const response = await fetch(url);
  if (!response.ok) fail(`не удалось скачать артефакт (HTTP ${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) fail('артефакт сборки пуст');

  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'engine-release-')),
    path.basename(new URL(url).pathname) || 'build.bin',
  );
  fs.writeFileSync(file, bytes);
  return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};

const releaseEngine = async ({ args, repository }) => {
  const version = readEngineVersion(ROOT);
  const notes = readReleaseNotes(ROOT, ENGINE_RELEASE_NOTES);
  if (!notes) fail(`нет файла ${ENGINE_RELEASE_NOTES}: без заметок релиз не выпускается`);
  if (notes.version !== version) {
    fail(
      `верхняя секция ${ENGINE_RELEASE_NOTES} — ${notes.version}, `
      + `а выпускается ${version}. Добавьте раздел "## ${version}" в начало файла.`,
    );
  }

  const tag = engineReleaseTag(version);
  const title = `Positronium ${version}`;
  const body = renderReleaseBody(notes);
  const profile = args.aab ? 'production' : 'preview';
  const assetName = args.aab ? ENGINE_AAB_ASSET : ENGINE_APK_ASSET;

  console.log(`[release] движок ${repository} · ${tag} · ${assetName} · профиль ${profile}`);
  if (args.dryRun) {
    console.log(`[release] dry-run: собрали бы профиль ${profile} и опубликовали ${tag}`);
    return;
  }

  const build = resolveBuild({ args, profile });
  console.log(`[release] сборка ${build.id}: ${build.status}`);
  const artifact = await downloadArtifact(build);
  console.log(`[release] файл: ${artifact.bytes} байт, sha256 ${artifact.sha256}`);

  const index = args.aab
    ? null
    : buildAppReleaseIndex({
      repository,
      version,
      notes,
      asset: assetName,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    });

  await createRelease({ repository, tag, title, body, file: artifact.file, assetName });
  console.log(`[release] GitHub Release ${tag}: ${assetName}`);

  if (args.aab && args.submit) {
    // Без --non-interactive: первый запуск спрашивает ключ сервисного аккаунта
    // Google Play и запоминает его в EAS.
    console.log('[release] отправка AAB в Google Play (eas submit)');
    eas(['submit', '--platform', 'android', '--profile', 'production', '--id', build.id]);
  }

  if (index) {
    fs.writeFileSync(path.join(ROOT, APP_RELEASE_FILE), renderAppReleaseIndex(index));
    commitRelease({ files: [APP_RELEASE_FILE], message: `Релиз ${tag}: индекс обновлений` });
  }

  fs.rmSync(path.dirname(artifact.file), { recursive: true, force: true });
  console.log(`[release] готово: https://github.com/${repository}/releases/tag/${tag}`);
  if (!args.aab) {
    console.log(`[release] постоянная ссылка: https://github.com/${repository}/releases/latest/download/${assetName}`);
  }
};

// --- сеттинг --------------------------------------------------------------

/** Папки верхнего уровня с manifest.json — это опубликованные сеттинги. */
const listSettings = () => {
  const settings = [];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (['node_modules', 'tools', '.git'].includes(entry.name)) continue;
    const manifestFile = path.join(ROOT, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest?.id && manifest.id !== entry.name) {
      fail(`${entry.name}/manifest.json объявляет id "${manifest.id}" — папка и id должны совпадать`);
    }
    settings.push({ id: entry.name, directory: path.join(ROOT, entry.name), manifest, manifestFile });
  }
  return settings;
};

/** esbuild нужен упаковщику: ставим его в tools/ один раз. */
const ensurePackToolchain = () => {
  const toolsDir = path.join(ROOT, 'tools');
  const nodeModules = path.join(toolsDir, 'node_modules');
  if (fs.existsSync(path.join(nodeModules, 'esbuild'))) return nodeModules;
  if (!hasCommand('npm')) fail('для сборки .trpg нужен npm (esbuild ставится в tools/node_modules)');
  const manifestFile = path.join(toolsDir, 'package.json');
  if (!fs.existsSync(manifestFile)) {
    fs.writeFileSync(manifestFile, `${JSON.stringify({
      name: 'positronium-setting-tools',
      private: true,
      devDependencies: { esbuild: 'latest' },
    }, null, 2)}\n`);
  }
  console.log('[release] esbuild не найден — ставлю в tools/');
  try {
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: toolsDir, stdio: 'inherit' });
  } catch {
    fail('не удалось поставить esbuild: выполните "npm install --prefix tools" вручную');
  }
  if (!fs.existsSync(path.join(nodeModules, 'esbuild'))) fail('esbuild так и не появился в tools/node_modules');
  return nodeModules;
};

const buildTrpg = ({ setting, output, nodeModules }) => {
  run(
    'python3',
    [path.join(ROOT, 'tools', 'pack-setting.py'), setting.directory, '--output', output],
    { env: { ...process.env, NODE_PATH: nodeModules } },
  );
  return output;
};

/**
 * Убрать релизы до-семантической нумерации (`fallout-v1`). Клиент сравнивает
 * версии из release.json, а человек — список релизов: «v1» рядом с «v1.0.0»
 * только путает. Ошибка уборки не отменяет уже выпущенный релиз.
 */
const pruneLegacyReleases = async ({ repository, settingId }) => {
  const removed = [];
  if (hasCommand('gh')) {
    const list = parseJson(
      run('gh', ['release', 'list', '--repo', repository, '--limit', '100', '--json', 'tagName']),
      'release list',
    );
    for (const item of Array.isArray(list) ? list : []) {
      if (!isLegacyReleaseTag(settingId, item.tagName)) continue;
      run('gh', ['release', 'delete', item.tagName, '--repo', repository, '--yes', '--cleanup-tag']);
      removed.push(item.tagName);
    }
    return removed;
  }

  const key = token();
  if (!key) return removed;
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'positronium-release',
  };
  const response = await fetch(`${API_BASE}/repos/${repository}/releases?per_page=100`, { headers });
  if (!response.ok) return removed;
  for (const release of await response.json()) {
    if (!isLegacyReleaseTag(settingId, release.tag_name)) continue;
    await fetch(`${API_BASE}/repos/${repository}/releases/${release.id}`, { method: 'DELETE', headers });
    await fetch(`${API_BASE}/repos/${repository}/git/refs/tags/${encodeURIComponent(release.tag_name)}`, {
      method: 'DELETE',
      headers,
    });
    removed.push(release.tag_name);
  }
  return removed;
};

const releaseSettings = async ({ args, repository }) => {
  const all = listSettings();
  if (all.length === 0) fail('в репозитории нет ни одной папки с manifest.json');
  const selected = args.setting ? all.filter((item) => item.id === args.setting) : all;
  if (selected.length === 0) fail(`нет сеттинга "${args.setting}"`);

  const indexPath = path.join(ROOT, RELEASE_INDEX_FILE);
  const previous = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : null;
  const previousSettings = previous?.settings ?? {};

  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setting-release-'));
  const packages = [];
  const pendingManifests = [];

  for (const setting of selected) {
    const version = nextReleaseVersion({
      manifestVersion: String(setting.manifest.version),
      publishedVersion: previousSettings[setting.id]?.version,
      level: args.bump,
      explicitVersion: args.version,
    });
    const notesFile = releaseNotesFile(setting.id);
    const notes = readReleaseNotes(ROOT, notesFile);
    if (!notes) fail(`нет файла заметок ${notesFile}: без него релиз не выпускается`);
    if (notes.version !== version) {
      fail(
        `верхняя секция ${notesFile} — ${notes.version}, `
        + `а выпускается ${version}. Добавьте раздел "## ${version}" в начало файла.`,
      );
    }
    console.log(`[release] ${setting.id}: ${setting.manifest.version} → ${version}`);
    packages.push({ setting, version, notes });
  }

  console.log(`[release] сеттинги ${repository} · ${packages.map((p) => releaseTag(p.setting.id, p.version)).join(', ')}`);
  if (args.dryRun) {
    console.log('[release] dry-run: собрали бы .trpg и выпустили релизы');
    return;
  }

  const nodeModules = ensurePackToolchain();

  const built = packages.map(({ setting, version, notes }) => {
    // Пакет собирается из манифеста: номер внутри .trpg должен совпадать
    // с тегом, поэтому манифест обновляем до упаковки.
    if (String(setting.manifest.version) !== version) {
      fs.writeFileSync(setting.manifestFile, `${JSON.stringify({ ...setting.manifest, version }, null, 2)}\n`);
      pendingManifests.push(path.relative(ROOT, setting.manifestFile));
    }
    const asset = `${setting.id}.trpg`;
    const file = buildTrpg({ setting, output: path.join(artifactDir, asset), nodeModules });
    const bytes = fs.statSync(file).size;
    const digest = sha256(file);
    console.log(`[release] ${asset}: ${bytes} байт, sha256 ${digest}`);
    return { setting, version, notes, asset, file, bytes, sha256: digest };
  });

  // Сначала релизы, потом индекс: при сбое публикации в репозитории не
  // появится ссылка на несуществующий релиз.
  for (const entry of built) {
    const tag = releaseTag(entry.setting.id, entry.version);
    const title = `${entry.setting.manifest.name ?? entry.setting.id} ${entry.version}`;
    await createRelease({
      repository,
      tag,
      title,
      body: renderReleaseBody({ version: entry.version, title: entry.notes.title, body: entry.notes.body }),
      file: entry.file,
      assetName: entry.asset,
    });
    console.log(`[release] GitHub Release ${tag}: ${entry.asset}`);
  }

  for (const entry of built) {
    try {
      const removed = await pruneLegacyReleases({ repository, settingId: entry.setting.id });
      if (removed.length > 0) console.log(`[release] ${entry.setting.id}: убраны старые релизы ${removed.join(', ')}`);
    } catch (error) {
      console.warn(`[release] старые теги ${entry.setting.id} не убраны: ${error?.message ?? error}`);
    }
  }

  const settings = { ...previousSettings };
  for (const entry of built) {
    const tag = releaseTag(entry.setting.id, entry.version);
    settings[entry.setting.id] = {
      id: entry.setting.id,
      name: entry.setting.manifest.name ?? entry.setting.id,
      version: entry.version,
      packFormat: entry.setting.manifest.packFormat ?? 1,
      requiresCore: entry.setting.manifest.requiresCore ?? '>=0',
      tag,
      asset: entry.asset,
      bytes: entry.bytes,
      sha256: entry.sha256,
      assetUrl: `https://github.com/${repository}/releases/download/${tag}/${entry.asset}`,
      latestUrl: `https://github.com/${repository}/releases/latest/download/${entry.asset}`,
    };
  }
  const index = buildReleaseIndex({
    repository,
    packages: Object.values(settings).map((entry) => ({
      id: entry.id,
      manifest: { version: entry.version, name: entry.name, packFormat: entry.packFormat, requiresCore: entry.requiresCore },
      asset: entry.asset,
      sha256: entry.sha256,
      bytes: entry.bytes,
    })),
  });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  commitRelease({
    files: [RELEASE_INDEX_FILE, ...pendingManifests],
    message: `Релиз ${built.map((entry) => releaseTag(entry.setting.id, entry.version)).join(', ')}`,
  });

  fs.rmSync(artifactDir, { recursive: true, force: true });
  for (const entry of built) {
    console.log(`[release] готово: https://github.com/${repository}/releases/tag/${releaseTag(entry.setting.id, entry.version)}`);
    console.log(`[release] постоянная ссылка: ${settings[entry.setting.id].latestUrl}`);
  }
};

// --- запуск ---------------------------------------------------------------

const detectMode = () => {
  if (fs.existsSync(path.join(ROOT, 'app.json')) && fs.existsSync(path.join(ROOT, ENGINE_RELEASE_NOTES))) {
    return 'engine';
  }
  if (fs.existsSync(path.join(ROOT, 'tools', 'pack-setting.py'))) {
    return 'setting';
  }
  return null;
};

const main = async () => {
  const args = baseArgs(process.argv);
  const mode = detectMode();
  if (!mode) {
    fail(
      'не понял, что релизить: нужен app.json + release-notes/engine.md (движок) '
      + 'или tools/pack-setting.py и папка сеттинга с manifest.json',
    );
  }
  if (mode === 'setting' && (args.aab || args.submit || args.buildId || args.skipBuild)) {
    fail('--aab/--submit/--build-id/--skip-build относятся к релизу движка');
  }
  if (mode === 'engine' && (args.bump !== 'patch' || args.version || args.setting)) {
    fail('--bump/--version/--setting относятся к релизу сеттинга: версия движка — в app.json');
  }
  if (args.submit && !args.aab) fail('--submit работает только вместе с --aab');
  const settings = mode === 'setting' ? listSettings() : [];
  if (args.setting && !settings.some((item) => item.id === args.setting)) {
    fail(`нет сеттинга "${args.setting}" (есть: ${settings.map((item) => item.id).join(', ') || 'ни одного'})`);
  }
  if (args.version && settings.length > 1 && !args.setting) {
    fail('--version при нескольких сеттингах требует --setting: иначе один номер уехал бы во все');
  }
  const repository = args.repository || repositoryFromGit();
  if (mode === 'engine') return releaseEngine({ args, repository });
  return releaseSettings({ args, repository });
};

main().catch((error) => {
  // undici прячет причину сетевой ошибки в cause: без неё «fetch failed»
  // ничего не говорит о том, что именно не ответило.
  const cause = error?.cause?.message ? ` (${error.cause.message})` : '';
  fail(`${error?.message ?? String(error)}${cause}`);
});
