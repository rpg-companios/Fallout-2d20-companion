#!/usr/bin/env node
// Стенд совместимости: проверить готовый .trpg против ЭТОЙ версии движка.
//
// Запускать там, где лежит настоящий пакет (в Replit — после скачивания релиза):
//
//   node scripts/check-setting-package.mjs fallout.trpg
//   node scripts/check-setting-package.mjs dist/fallout.trpg --json
//
// Проверяется ровно тем же кодом, что и в приложении: скрипт собирает
// src/engine/settings/settingCompatibility.js через esbuild (он есть в
// devDependencies) и вызывает его. Поэтому расхождений «в стенде прошло,
// на телефоне упало» быть не может — логика одна и та же.
//
// Код возврата: 0 — пакет совместим, 1 — нет (или файл не прочитан).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPAT_MODULE = path.join(ROOT, 'src/engine/settings/settingCompatibility.js');
const HOST_MODULES_FILE = path.join(ROOT, 'src/engine/settings/settingRuntimeHost.js');

const fail = (message) => {
  console.error(`[check-package] ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const json = args.includes('--json');
const file = args.find((arg) => !arg.startsWith('-'));

if (!file) {
  console.error('usage: node scripts/check-setting-package.mjs <file.trpg> [--json]');
  process.exit(1);
}
if (!fs.existsSync(file)) fail(`файл не найден: ${file}`);

/** Тот же код, что в приложении: собираем ESM и импортируем. */
const loadCompatibility = async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setting-compat-'));
  const outfile = path.join(directory, 'compatibility.mjs');
  try {
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [COMPAT_MODULE],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      logLevel: 'error',
    });
  } catch (error) {
    fail(`не удалось собрать модуль совместимости: ${error.message}`);
  }
  return import(pathToFileURL(outfile).href);
};

/**
 * Host-модули, которые эта сборка отдаёт пакетам.
 *
 * Карта лежит в `settingRuntimeHost.js` и собирается из настоящих импортов
 * приложения, поэтому её нельзя импортировать в Node (потянет React Native).
 * Читаем ключи из исходника — и падаем громко, если формат изменится:
 * молча пропустить проверку хуже, чем отказаться её делать.
 */
const readHostModuleIds = () => {
  const source = fs.readFileSync(HOST_MODULES_FILE, 'utf8');
  const ids = new Set();
  for (const match of source.matchAll(/^\s*'([^']+)':\s*hostModule\(/gm)) ids.add(match[1]);
  if (ids.size === 0) {
    fail(`не удалось прочитать host-модули из ${path.relative(ROOT, HOST_MODULES_FILE)} `
      + '(изменился формат карты; проверка не выполнена)');
  }
  return ids;
};

/** Прочитать manifest.json из корня .trpg (zip) без распаковки на диск. */
const readManifest = async (archivePath) => {
  const { unzipSync, strFromU8 } = await import('fflate');
  const bytes = new Uint8Array(fs.readFileSync(archivePath));
  const entries = unzipSync(bytes, {
    filter: (entry) => entry.name === 'manifest.json' || entry.name.endsWith('/manifest.json'),
  });
  const names = Object.keys(entries);
  if (names.length === 0) fail('в архиве нет manifest.json');
  const rootNames = names.filter((name) => name.split('/').length === 2);
  if (rootNames.length !== 1) fail(`ожидается один корневой каталог пакета, найдено: ${names.join(', ')}`);
  const rootFolder = rootNames[0].split('/')[0];
  return { manifest: JSON.parse(strFromU8(entries[rootNames[0]])), rootFolder };
};

const compatibility = await loadCompatibility();
const { manifest, rootFolder } = await readManifest(file);
const hostModuleIds = readHostModuleIds();

const problems = [
  ...compatibility.checkSettingCompatibility({ manifest, hostModuleIds }),
  ...compatibility.checkRuntimeApi(manifest, 1),
];

const report = {
  file: path.resolve(file),
  rootFolder,
  id: manifest.id,
  version: manifest.version,
  compatibility: manifest.compatibility ?? null,
  capabilities: manifest.capabilities ?? [],
  hostModules: Array.isArray(manifest.hostModules) ? manifest.hostModules.length : 0,
  engineHostModules: hostModuleIds.size,
  engineVersion: compatibility.ENGINE_VERSION,
  problems,
  ok: problems.length === 0,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`пакет:      ${report.id} ${report.version}`);
  console.log(`архив:      ${report.file}`);
  console.log(`корень:     ${report.rootFolder}`);
  console.log(`движок:     ${compatibility.ENGINE_VERSION}`);
  console.log(`диапазон:   ${report.compatibility ? JSON.stringify(report.compatibility) : 'не объявлен'}`);
  console.log(
    `host:       ${report.hostModules} в пакете / ${report.engineHostModules} у движка, `
    + `возможностей: ${report.capabilities.length}`,
  );
  if (report.ok) {
    console.log('\nсовместим с этой версией движка');
  } else {
    console.log('\nНЕСОВМЕСТИМ:');
    for (const problem of problems) {
      console.log(`  - ${problem.code}: ${JSON.stringify(problem.params)}`);
    }
  }
}

process.exit(report.ok ? 0 : 1);
