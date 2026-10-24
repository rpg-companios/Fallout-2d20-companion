#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// esbuild ставится рядом со скриптом (`npm install --prefix tools` в
// репозитории сеттинга) или берётся из checkout'а движка. Отсутствие
// объясняется по-человечески, а не стектрейсом ERR_MODULE_NOT_FOUND.
const ESBUILD_MISSING = [
  'esbuild не установлен — без него нельзя собрать manifest.runtime.source.',
  'Поставьте зависимости движка (npm install) или укажите каталог со сборщиком',
  'через NODE_PATH=/path/to/node_modules.',
].join(' ');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const loadEsbuild = async (appRoot) => {
  const anchors = [
    appRoot ? path.join(appRoot, 'package.json') : null,
    path.join(SCRIPT_DIR, 'package.json'),          // tools/ в репозитории сеттинга
    path.join(SCRIPT_DIR, '..', 'package.json'),    // корень совмещённого репозитория
    path.join(process.cwd(), 'package.json'),
  ].filter(Boolean);
  for (const anchor of anchors) {
    if (!fs.existsSync(anchor)) continue;
    try {
      const resolved = createRequire(anchor).resolve('esbuild');
      const loaded = await import(pathToFileURL(resolved).href);
      return loaded.default ?? loaded;
    } catch {
      // пробуем следующий якорь: node_modules может лежать у движка, а не здесь
    }
  }
  throw new Error(ESBUILD_MISSING);
};

// Корень движка нужен только чтобы свериться со списком host-модулей.
// В репозитории сеттинга его нет вовсе: там рядом со скриптом лежит
// tools/host-modules.json, который пишет публикация.
const defaultAppRoot = path.resolve(SCRIPT_DIR, '..');
const HOST_MODULES_FILE = path.join(SCRIPT_DIR, 'host-modules.json');

const readHostModuleIds = (appRoot) => {
  const hostFile = appRoot ? path.join(appRoot, 'src/engine/settings/settingRuntimeHost.js') : null;
  try {
    if (hostFile && fs.existsSync(hostFile)) {
      // Ключи карты бывают в кавычках и без (`react: hostModule(...)`), и там
      // лежат не только `engine:*`: пакетные модули тоже приходят от хоста.
      return new Set(
        [...fs.readFileSync(hostFile, 'utf8')
          .matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*hostModule\(/gm)]
          .map((match) => match[1] ?? match[2] ?? match[3]),
      );
    }
  } catch {
    // читать исходник движка не обязательно — идём к JSON
  }
  try {
    if (fs.existsSync(HOST_MODULES_FILE)) {
      const ids = JSON.parse(fs.readFileSync(HOST_MODULES_FILE, 'utf8'));
      if (Array.isArray(ids)) return new Set(ids);
    }
  } catch {
    // битый JSON не должен ломать сборку пакета
  }
  return null;
};

const parseArguments = (argv) => {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
};

const isWithin = (parent, target) => {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const resolveRelativeFile = (basePath) => {
  const candidates = path.extname(basePath)
    ? [basePath]
    : [
      `${basePath}.js`, `${basePath}.jsx`, `${basePath}.ts`, `${basePath}.tsx`,
      `${basePath}.json`, `${basePath}.png`, `${basePath}.jpg`, `${basePath}.jpeg`,
      `${basePath}.webp`, `${basePath}.ttf`, `${basePath}.otf`,
      path.join(basePath, 'index.js'), path.join(basePath, 'index.jsx'),
      path.join(basePath, 'index.ts'), path.join(basePath, 'index.tsx'),
    ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? basePath;
};

const normalizePath = (value) => value.split(path.sep).join('/');
const stripSourceExtension = (value) => value.replace(/\.(?:js|jsx|ts|tsx|json)$/i, '');
const isAsset = (value) => /\.(?:png|jpe?g|webp|gif|ttf|otf)$/i.test(value);
const isSharedEngineModule = (relativePath) => (
  /^(?:src\/store|src\/saves|src\/debug|components\/alerts)(?:\/|$)/.test(relativePath)
  || /^components\/screens\/InventoryScreen\/(?:InventoryScreen|logic\/inventoryI18n|modals\/AddItemModal)(?:\.[^/]+)?$/.test(relativePath)
  || /^db\/(?:Database|catalogSource)(?:\.[^/]+)?$/.test(relativePath)
  || /^i18n\/(?:locale|equipmentCatalog)(?:\.[^/]+)?$/.test(relativePath)
  || /^domain\/(?:counters|craftingEngine|d20Checks|deepMerge|diceRollsLogic|effects|equipEquip|equipmentKits|equippedArmor|immunities|itemfitRules|levelBands|modsEquip|moduleLocale|numericModifier|origins|perks|protectionKind|registry|resolveItem|sceneRiskChecks)(?:\.[^/]+)?$/.test(relativePath)
  || /^src\/engine\/(?:debug\/runtimeTrace|items\/weaponMods|settings\/activeSettingRuntime)(?:\.[^/]+)?$/.test(relativePath)
);

// --- JSX без привязки к host-модулю react/jsx-runtime ----------------------
//
// Автоматический JSX (esbuild `jsx: 'automatic'`) вставляет
// `import { jsx } from 'react/jsx-runtime'`. Такой импорт остаётся внешним, и
// пакет начинает требовать host-модуль, которого в установленном APK может не
// быть: сборки движка до 1.0.2 знают `react`, но не `react/jsx-runtime`.
// Итог — «Не удалось запустить сеттинг», причём APK ещё и прячет причину.
//
// Поэтому react/jsx-runtime собирается внутрь пакета: три обёртки над
// `React.createElement`. `react` есть в карте host-модулей у любой сборки,
// значит пакет работает и на старом APK, и на новом — без новых требований.
const JSX_RUNTIME_SHIM = [
  "import * as React from 'react';",
  'export const Fragment = React.Fragment;',
  'export const jsx = (type, props, key) => React.createElement(type, props, key);',
  'export const jsxs = jsx;',
  'export const jsxDEV = jsx;',
  '',
].join('\n');

const jsxRuntimeShimPlugin = {
  name: 'setting-runtime-jsx-shim',
  setup(build) {
    build.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, (args) => ({
      path: args.path,
      namespace: 'setting-jsx-shim',
    }));
    // `react` из шима — тот же host-модуль, что и остальные пакетные импорты.
    // Явное правило нужно, потому что виртуальный модуль резолвится не из
    // кошелька, и общее `packages: 'external'` на него не распространяется.
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', external: true }));
    build.onLoad({ filter: /.*/, namespace: 'setting-jsx-shim' }, () => ({
      contents: JSX_RUNTIME_SHIM,
      loader: 'js',
    }));
  },
};

/**
 * tsconfig с зафиксированным JSX пишется во временный каталог: esbuild иначе
 * берёт ближайший файл от собираемого исходника, и трансформ зависит от того,
 * где лежит кошелёк. Файл удаляется после сборки.
 */
const PINNED_TSCONFIG = '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"react"}}';
let pinnedTsconfigPath = null;
const writePinnedTsconfig = () => {
  if (pinnedTsconfigPath) return pinnedTsconfigPath;
  pinnedTsconfigPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'setting-tsconfig-')), 'tsconfig.json');
  fs.writeFileSync(pinnedTsconfigPath, PINNED_TSCONFIG);
  return pinnedTsconfigPath;
};
const cleanupPinnedTsconfig = () => {
  if (!pinnedTsconfigPath) return;
  fs.rmSync(path.dirname(pinnedTsconfigPath), { recursive: true, force: true });
  pinnedTsconfigPath = null;
};

const run = async () => {
  const args = parseArguments(process.argv.slice(2));
  // В репозитории сеттинга исходников движка нет: путь передаётся
  // --engine (или POSITRONIUM_ENGINE), упаковщик делает это сам.
  // Движок не обязателен: кошелёк ходит в него только через `engine:<id>`,
  // такие импорты остаются внешними и их отдаёт хост приложения.
  const engineArg = args.engine ?? process.env.POSITRONIUM_ENGINE;
  const appRoot = engineArg
    ? path.resolve(engineArg)
    : (fs.existsSync(path.join(defaultAppRoot, 'src', 'engine')) ? defaultAppRoot : null);
  if (engineArg && !fs.existsSync(path.join(appRoot, 'src', 'engine'))) {
    throw new Error(`engine root has no src/engine: ${appRoot}`);
  }
  const walletRoot = path.resolve(args.wallet ?? 'modules/fallout');
  const sourceRelativePath = args.source;
  const outputPath = path.resolve(args.output ?? 'runtime/setting.cjs');
  if (!sourceRelativePath) throw new Error('--source is required');
  if (path.isAbsolute(sourceRelativePath) || sourceRelativePath.split(/[\\/]/).some((part) => part === '..')) {
    throw new Error('--source must be a safe relative path within the setting wallet');
  }

  const sourcePath = path.resolve(walletRoot, sourceRelativePath);
  if (!isWithin(walletRoot, sourcePath) || !fs.statSync(sourcePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`setting runtime source not found: ${sourcePath}`);
  }

  const esbuild = await loadEsbuild(appRoot);
  const result = await esbuild.build({
    absWorkingDir: appRoot ?? walletRoot,
    entryPoints: [sourcePath],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2020',
    packages: 'external',
    jsx: 'automatic',
    // Ближайший tsconfig.json перебивает jsx: 'automatic' — в совмещённом
    // репозитории (там "jsx": "react") пакет молча собирался классическим
    // трансформом, в репозитории сеттинга — автоматическим. Один и тот же
    // кошелёк давал разные бандлы. Свой tsconfig убирает зависимость от места
    // сборки: результат одинаков везде.
    tsconfig: writePinnedTsconfig(),
    loader: { '.js': 'jsx', '.tsx': 'tsx' },
    plugins: [jsxRuntimeShimPlugin, {
      name: 'setting-runtime-host-boundary',
      setup(build) {
        build.onResolve({ filter: /^\.\.?\// }, (resolveArgs) => {
          const resolvedPath = resolveRelativeFile(path.resolve(resolveArgs.resolveDir, resolveArgs.path));
          if (!path.isAbsolute(resolvedPath)) return undefined;
          const inWallet = isWithin(walletRoot, resolvedPath);
          const inApp = appRoot ? isWithin(appRoot, resolvedPath) : false;
          if (!inWallet && !inApp) {
            return { errors: [{ text: `setting import escapes wallet and app roots: ${resolveArgs.path}` }] };
          }

          if (isAsset(resolvedPath)) {
            if (inWallet) {
              return {
                path: `setting-asset:${normalizePath(path.relative(walletRoot, resolvedPath))}`,
                external: true,
              };
            }
            if (!appRoot) {
              return { errors: [{ text: `setting asset import escapes the wallet: ${resolveArgs.path}` }] };
            }
            return {
              path: `engine-asset:${normalizePath(path.relative(appRoot, resolvedPath))}`,
              external: true,
            };
          }

          // Ветка ниже нужна только старым кошелькам с относительными
          // импортами в движок. Новые ходят через `engine:<id>`.
          if (!inWallet && appRoot) {
            const appRelativePath = normalizePath(path.relative(appRoot, resolvedPath));
            if (isSharedEngineModule(appRelativePath)) {
              return { path: `engine:${stripSourceExtension(appRelativePath)}`, external: true };
            }
          }

          return undefined;
        });
      },
    }],
    logLevel: 'silent',
  });

  const output = result.outputFiles[0]?.contents;
  if (!output || output.byteLength === 0) throw new Error('esbuild produced an empty setting runtime bundle');

  const externalImports = Object.values(result.metafile.outputs)
    .flatMap((entry) => entry.imports)
    .filter((entry) => entry.external)
    .map((entry) => entry.path);
  // Список host-модулей: из checkout'а движка либо из tools/host-modules.json.
  // Проверяется КАЖДЫЙ внешний импорт, а не только `engine:*`: пакет,
  // требующий `react/jsx-runtime`, на APK без такого модуля ставится и не
  // запускается («Не удалось запустить сеттинг»). Такое лучше поймать здесь.
  // `setting-asset:` и `engine-asset:` — свои файлы пакета, они всегда есть.
  const hostModuleIds = readHostModuleIds(appRoot);
  if (hostModuleIds) {
    const missingHostModules = [...new Set(externalImports)]
      .filter((moduleId) => !moduleId.startsWith('setting-asset:')
        && !moduleId.startsWith('engine-asset:')
        && !hostModuleIds.has(moduleId))
      .sort();
    if (missingHostModules.length > 0) {
      throw new Error(
        `runtime bundle requires modules the engine host does not provide: ${missingHostModules.join(', ')}. `
        + 'Обновите движок или уберите эти импорты из кошелька (список: tools/host-modules.json).',
      );
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  process.stdout.write(JSON.stringify({
    output: outputPath,
    bytes: output.byteLength,
    externalImports: [...new Set(externalImports)].sort(),
  }) + '\n');
};

run()
  .catch((error) => {
    process.stderr.write(`[build-setting-runtime] ${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(cleanupPinnedTsconfig);
