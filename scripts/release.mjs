#!/usr/bin/env node
// scripts/release.mjs
// Релиз движка ОДНОЙ командой, из самого репозитория движка.
//
// Порядок работы владельца (2026-10-22): разработка и веб-режим — в смешанном
// репозитории; когда результат устроил, оттуда публикуется код в движок; а
// сборка и релиз живут здесь, в движке. Поэтому этот скрипт не требует ни
// путей из другого чекаута, ни ручного скачивания APK:
//
//   npm run release              # APK → GitHub Release → app-release.json → push
//   npm run release -- --aab     # AAB → GitHub Release (файл для Google Play)
//   npm run release -- --aab --submit   # ещё и загрузка AAB в Play Console
//
// Что делает:
//   1. берёт версию из app.json (expo.version) и заметки из
//      release-notes/engine.md — номер секции обязан совпасть;
//   2. собирает профиль EAS (preview → APK, production → AAB);
//   3. скачивает артефакт сборки (EAS отдаёт ссылку — руками ничего не качаем);
//   4. создаёт GitHub Release engine-v<версия> с ассетом positronium.apk/.aab;
//   5. для APK пишет app-release.json (по нему приложение видит новую версию)
//      и коммитит его в репозиторий.
//
// Токен: gh CLI (если авторизован) или GH_TOKEN / GITHUB_TOKEN /
// PUBLISH_GITHUB_TOKEN. Сборка идёт под аккаунтом Expo (`npx eas-cli login`).

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const parseArgs = (argv) => {
  const args = {
    aab: false,
    submit: false,
    buildId: null,
    skipBuild: false,
    dryRun: false,
    repository: null,
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
      case '-h':
      case '--help':
        console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 24).join('\n'));
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

const token = () => (
  process.env.PUBLISH_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
);

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

/** Собрать (или взять готовую) сборку и вернуть её объект. */
const resolveBuild = ({ args, profile }) => {
  if (args.buildId) {
    const build = parseJson(eas(['build:view', args.buildId, '--json']), 'build:view');
    return build;
  }
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

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'engine-release-')), path.basename(new URL(url).pathname) || 'build.bin');
  fs.writeFileSync(file, bytes);
  return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};

/** GitHub Release: gh CLI, а без него — REST по токену. */
const createRelease = async ({ repository, tag, title, body, file, assetName }) => {
  if (hasCommand('gh')) {
    let exists = true;
    try {
      execFileSync('gh', ['release', 'view', tag, '--repo', repository], { stdio: 'ignore' });
    } catch {
      exists = false;
    }
    if (exists) {
      execFileSync('gh', ['release', 'upload', tag, file, '--repo', repository, '--clobber'], { stdio: 'inherit' });
      // Тело существующего релиза не переписываем: заметки могли править руками.
      return;
    }
    const notesFile = `${file}.notes.md`;
    fs.writeFileSync(notesFile, body);
    execFileSync('gh', [
      'release', 'create', tag, file,
      '--repo', repository,
      '--target', 'main',
      '--title', title,
      '--notes-file', notesFile,
    ], { stdio: 'inherit' });
    fs.rmSync(notesFile, { force: true });
    return;
  }

  const key = token();
  if (!key) {
    fail('для релиза нужен gh CLI или токен GH_TOKEN / PUBLISH_GITHUB_TOKEN');
  }
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'positronium-release',
  };
  const created = await fetch(`https://api.github.com/repos/${repository}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: title, body, target_commitish: 'main' }),
  });
  let release = null;
  if (created.ok) {
    release = await created.json();
  } else {
    const existing = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, { headers });
    if (!existing.ok) fail(`не удалось создать релиз ${tag} (HTTP ${created.status})`);
    release = await existing.json();
  }

  const upload = await fetch(
    `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
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

const commitReleaseIndex = ({ file, tag }) => {
  const status = run('git', ['status', '--porcelain', '--', APP_RELEASE_FILE]).trim();
  if (!status) {
    console.log(`[release] ${APP_RELEASE_FILE} не изменился`);
    return false;
  }
  run('git', ['add', APP_RELEASE_FILE]);
  run('git', ['commit', '-m', `Релиз ${tag}: индекс обновлений`]);
  run('git', ['push', 'origin', 'HEAD']);
  console.log(`[release] ${APP_RELEASE_FILE} закоммичен и отправлен`);
  return true;
};

const main = async () => {
  const args = parseArgs(process.argv);
  const version = readEngineVersion(ROOT);
  const notes = readReleaseNotes(ROOT, ENGINE_RELEASE_NOTES);
  if (!notes) fail(`нет файла ${ENGINE_RELEASE_NOTES}: без заметок релиз не выпускается`);
  if (notes.version !== version) {
    fail(
      `верхняя секция ${ENGINE_RELEASE_NOTES} — ${notes.version}, `
      + `а выпускается ${version}. Добавьте раздел "## ${version}" в начало файла.`,
    );
  }

  const repository = args.repository || repositoryFromGit();
  const tag = engineReleaseTag(version);
  const title = `Positronium ${version}`;
  const body = renderReleaseBody(notes);
  const profile = args.aab ? 'production' : 'preview';
  const assetName = args.aab ? ENGINE_AAB_ASSET : ENGINE_APK_ASSET;

  console.log(`[release] ${repository} · ${tag} · ${assetName} · профиль ${profile}`);
  if (args.dryRun) {
    console.log(`[release] dry-run: собрали бы профиль ${profile} и опубликовали ${tag}`);
    return;
  }

  const build = resolveBuild({ args, profile });
  console.log(`[release] сборка ${build.id}: ${build.status}`);
  const artifact = await downloadArtifact(build);
  console.log(`[release] файл: ${artifact.bytes} байт, sha256 ${artifact.sha256}`);

  // Индекс пишем до релиза, но коммитим после: если публикация упадёт,
  // в репозитории не останется ссылки на несуществующий релиз.
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
    commitReleaseIndex({ file: artifact.file, tag });
  }

  fs.rmSync(path.dirname(artifact.file), { recursive: true, force: true });
  console.log(`[release] готово: https://github.com/${repository}/releases/tag/${tag}`);
  if (!args.aab) {
    console.log(`[release] постоянная ссылка: https://github.com/${repository}/releases/latest/download/${assetName}`);
  }
};

main().catch((error) => fail(error?.message ?? String(error)));
