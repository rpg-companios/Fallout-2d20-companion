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
      default:
        fail(`unknown argument: ${argument}`);
    }
  }
  if (!['all', 'engine', 'setting'].includes(args.target)) fail(`unknown target: ${args.target}`);
  if (args.release && args.target === 'engine') fail('--release is supported for the setting repository only');
  return args;
};

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

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
  } else {
    git(directory, 'reset', '--hard', 'HEAD');
    git(directory, 'clean', '-fdx');
  }
  return report;
};

const publishSetting = (args, config) => {
  const repository = config.setting;
  if (!repository?.repository) fail('settings/repositories.json has no setting repository');
  const workdir = path.resolve(ROOT, args.workdir);
  const directory = ensureWorktree(repository, workdir);
  const wallets = planSettingWallets(ROOT, repository.wallets);
  const tools = planSettingToolFiles(ROOT);

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
    if (!hasCommand('gh')) fail('gh CLI is required to create a GitHub release');
    for (const entry of packages) {
      const tag = `${entry.id}-v${entry.manifest.version}`;
      const title = `${entry.manifest.name ?? entry.id} ${entry.manifest.version}`;
      const exists = (() => {
        try {
          execFileSync('gh', ['release', 'view', tag, '--repo', repository.repository], { stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      })();
      if (exists) {
        execFileSync('gh', ['release', 'upload', tag, entry.file, '--repo', repository.repository, '--clobber'], { stdio: 'inherit' });
      } else {
        execFileSync('gh', [
          'release', 'create', tag, entry.file,
          '--repo', repository.repository,
          '--title', title,
          '--notes', `Пакет сеттинга ${entry.id} версии ${entry.manifest.version}.`,
        ], { stdio: 'inherit' });
      }
      console.log(`[publish] release: ${tag} → ${repository.repository}`);
    }
    report.released = true;
  } else if (!args.push) {
    git(directory, 'reset', '--hard', 'HEAD');
    git(directory, 'clean', '-fdx');
  }
  return report;
};

const main = () => {
  const args = parseArguments(process.argv.slice(2));
  if (!fs.existsSync(args.config)) fail(`missing ${args.config}`);
  const config = readJson(args.config);
  const reports = [];
  if (args.target === 'all' || args.target === 'engine') reports.push(publishEngine(args, config));
  if (args.target === 'all' || args.target === 'setting') reports.push(publishSetting(args, config));
  console.log(JSON.stringify({ ok: true, reports }, null, 2));
};

main();
